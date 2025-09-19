// api/ping.js - API de ping des services
import { kv } from '@vercel/kv';

const SERVICES_KEY = 'keepalive:services';
const STATS_KEY = 'keepalive:stats';

// Configuration du ping
const PING_CONFIG = {
    timeout: 25000,        // 25 secondes (limite Vercel: 30s)
    userAgent: 'KeepAlive-Service-Vercel/1.0 (+https://keep-alive.vercel.app)',
    maxRetries: 2,
    retryDelay: 1000
};

export default async function handler(req, res) {
    // Configuration CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Méthode non autorisée. Utilisez POST.' 
        });
    }

    try {
        console.log('🚀 Démarrage du ping de tous les services');
        
        // Récupération des services et statistiques
        const [services, stats] = await Promise.all([
            kv.get(SERVICES_KEY) || [],
            kv.get(STATS_KEY) || { totalPings: 0, successfulPings: 0 }
        ]);

        if (!services || services.length === 0) {
            return res.json({
                success: true,
                message: 'Aucun service à pinger',
                results: [],
                stats: stats
            });
        }

        console.log(`📊 ${services.length} services à pinger`);

        // Ping de tous les services en parallèle
        const pingPromises = services.map(service => 
            pingServiceWithRetry(service)
        );

        const results = await Promise.allSettled(pingPromises);
        
        // Traitement des résultats
        const pingResults = [];
        let successCount = 0;
        let totalCount = 0;

        for (let i = 0; i < results.length; i++) {
            const service = services[i];
            const result = results[i];
            
            totalCount++;

            if (result.status === 'fulfilled') {
                const pingResult = result.value;
                pingResults.push(pingResult);

                // Mise à jour du service
                if (pingResult.success) {
                    successCount++;
                    service.lastPing = new Date().toISOString();
                    service.status = 'active';
                    service.errorCount = Math.max(0, (service.errorCount || 0) - 1);
                    service.responseTime = pingResult.responseTime;
                } else {
                    service.errorCount = (service.errorCount || 0) + 1;
                    service.status = service.errorCount > 3 ? 'error' : 'warning';
                    service.lastError = pingResult.error;
                    service.lastErrorTime = new Date().toISOString();
                }
            } else {
                // Erreur lors du ping
                pingResults.push({
                    service: service.name,
                    success: false,
                    error: 'Erreur interne lors du ping'
                });

                service.errorCount = (service.errorCount || 0) + 1;
                service.status = 'error';
                service.lastError = result.reason?.message || 'Erreur inconnue';
                service.lastErrorTime = new Date().toISOString();
            }
        }

        // Mise à jour des statistiques globales
        const updatedStats = {
            totalPings: stats.totalPings + totalCount,
            successfulPings: stats.successfulPings + successCount,
            lastPingTime: new Date().toISOString(),
            lastPingCount: totalCount,
            lastSuccessCount: successCount
        };

        // Sauvegarde en parallèle
        await Promise.all([
            kv.set(SERVICES_KEY, services),
            kv.set(STATS_KEY, updatedStats)
        ]);

        console.log(`✅ Ping terminé: ${successCount}/${totalCount} succès`);

        return res.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: pingResults.map(r => ({
                service: r.service,
                status: r.success ? 'success' : 'error',
                responseCode: r.responseCode,
                responseTime: r.responseTime,
                error: r.error
            })),
            stats: updatedStats,
            summary: {
                total: totalCount,
                successful: successCount,
                failed: totalCount - successCount,
                successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100
            }
        });

    } catch (error) {
        console.error('❌ Erreur lors du ping global:', error);
        return res.status(500).json({
            success: false,
            error: 'Erreur interne lors du ping des services',
            details: error.message
        });
    }
}

/**
 * Ping un service avec retry automatique
 */
async function pingServiceWithRetry(service, attempt = 1) {
    try {
        console.log(`🔄 Ping ${service.name} (tentative ${attempt})`);
        
        const startTime = Date.now();
        
        // Configuration de la requête
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PING_CONFIG.timeout);
        
        const response = await fetch(service.url, {
            method: 'HEAD', // Utilise HEAD pour économiser la bande passante
            signal: controller.signal,
            headers: {
                'User-Agent': PING_CONFIG.userAgent,
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'Connection': 'close'
            },
            // Désactiver le suivi des redirections pour éviter les timeouts
            redirect: 'manual'
        });
        
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        
        // Considérer les redirections comme des succès
        if (response.ok || (response.status >= 300 && response.status < 400)) {
            console.log(`✅ ${service.name}: OK (${response.status}) - ${responseTime}ms`);
            
            return {
                service: service.name,
                success: true,
                responseCode: response.status,
                responseTime: responseTime
            };
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // Retry en cas d'erreur (sauf si c'est une erreur d'abort)
        if (attempt < PING_CONFIG.maxRetries && error.name !== 'AbortError') {
            console.log(`⚠️ ${service.name}: Erreur, retry dans ${PING_CONFIG.retryDelay}ms`);
            
            await sleep(PING_CONFIG.retryDelay);
            return pingServiceWithRetry(service, attempt + 1);
        }
        
        // Gestion spéciale des erreurs courantes
        let errorMessage = error.message;
        
        if (error.name === 'AbortError') {
            errorMessage = 'Timeout (service trop lent à répondre)';
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = 'Nom de domaine introuvable';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Connexion refusée';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'Timeout de connexion';
        }
        
        console.log(`❌ ${service.name}: ${errorMessage} (${responseTime}ms)`);
        
        return {
            service: service.name,
            success: false,
            error: errorMessage,
            responseTime: responseTime,
            attempts: attempt
        };
    }
}

/**
 * Fonction d'attente
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fonction de nettoyage des anciennes données (appelée périodiquement)
 */
export async function cleanupOldData() {
    try {
        const services = await kv.get(SERVICES_KEY) || [];
        const now = Date.now();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
        
        let cleanedCount = 0;
        
        const cleanedServices = services.filter(service => {
            const created = new Date(service.created).getTime();
            const isOld = (now - created) > maxAge;
            const hasRecentActivity = service.lastPing && 
                (now - new Date(service.lastPing).getTime()) < (7 * 24 * 60 * 60 * 1000);
            
            if (isOld && !hasRecentActivity && service.status === 'error') {
                cleanedCount++;
                return false;
            }
            return true;
        });
        
        if (cleanedCount > 0) {
            await kv.set(SERVICES_KEY, cleanedServices);
            console.log(`🧹 Nettoyage: ${cleanedCount} services inactifs supprimés`);
        }
        
    } catch (error) {
        console.error('Erreur lors du nettoyage:', error);
    }
}