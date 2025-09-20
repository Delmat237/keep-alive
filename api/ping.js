import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

const MONITORS_KEY = 'keepalive:monitors';
const STATS_KEY = 'keepalive:stats';
const ACTIVITIES_KEY = 'keepalive:activities';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use environment variable in production

let redis;

function getRedisClient() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL);
    }
    return redis;
}

// Configuration du ping
const PING_CONFIG = {
    timeout: 25000,        // 25 secondes (limite Vercel: 30s)
    userAgent: 'KeepAlive-Service-Vercel/1.0 (+https://keep-alive-olive.vercel.app)',
    maxRetries: 2,
    retryDelay: 1000
};

export default async function handler(req, res) {
    // CORS Configuration
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

    // Verify JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        });
    }

    let decoded;
    try {
        decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    try {
        console.log(`🚀 Démarrage du ping des services pour l'utilisateur ${decoded.userId}`);
        
        const client = getRedisClient();
        
        // Récupération des moniteurs et statistiques
        const [monitorsData, statsData] = await Promise.all([
            client.get(MONITORS_KEY),
            client.get(STATS_KEY)
        ]);

        const allMonitors = monitorsData ? JSON.parse(monitorsData) : [];
        const userMonitors = allMonitors.filter(m => m.user_id === decoded.userId);
        const allStats = statsData ? JSON.parse(statsData) : {};
        const userStats = allStats[decoded.userId] || { totalPings: 0, successfulPings: 0, lastPingTime: null };

        if (!userMonitors || userMonitors.length === 0) {
            return res.json({
                success: true,
                message: 'Aucun service à pinger pour cet utilisateur',
                results: [],
                stats: userStats
            });
        }

        console.log(`📊 ${userMonitors.length} services à pinger pour l'utilisateur ${decoded.userId}`);

        // Récupération des activités existantes
        const activitiesData = await client.get(ACTIVITIES_KEY);
        const activities = activitiesData ? JSON.parse(activitiesData) : [];

        // Ping de tous les services en parallèle
        const pingPromises = userMonitors.map(monitor => 
            pingServiceWithRetry(monitor, decoded.userId, activities)
        );

        const results = await Promise.allSettled(pingPromises);
        
        // Traitement des résultats
        const pingResults = [];
        let successCount = 0;
        let totalCount = 0;

        for (let i = 0; i < results.length; i++) {
            const monitor = userMonitors[i];
            const result = results[i];
            
            totalCount++;

            if (result.status === 'fulfilled') {
                const pingResult = result.value;
                pingResults.push(pingResult);

                // Mise à jour du moniteur
                if (pingResult.success) {
                    successCount++;
                    const previousStatus = monitor.status;
                    monitor.last_check = new Date().toISOString();
                    monitor.status = 'active';
                    monitor.error_count = Math.max(0, (monitor.error_count || 0) - 1);
                    monitor.response_time = pingResult.responseTime;
                    monitor.last_error = null;

                    // Log activity if status changed
                    if (previousStatus !== 'active') {
                        activities.push({
                            id: Date.now(),
                            user_id: decoded.userId,
                            type: 'up',
                            message: `${monitor.name} is online`,
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    const previousStatus = monitor.status;
                    monitor.error_count = (monitor.error_count || 0) + 1;
                    monitor.status = monitor.error_count > 3 ? 'error' : 'warning';
                    monitor.last_error = pingResult.error;
                    monitor.last_error_time = new Date().toISOString();
                    monitor.response_time = pingResult.responseTime;

                    // Log activity if status changed
                    if (previousStatus !== monitor.status) {
                        activities.push({
                            id: Date.now(),
                            user_id: decoded.userId,
                            type: 'down',
                            message: `${monitor.name} is ${monitor.status === 'error' ? 'offline' : 'in warning state'}`,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            } else {
                // Erreur lors du ping
                pingResults.push({
                    service: monitor.name,
                    success: false,
                    error: 'Erreur interne lors du ping'
                });

                const previousStatus = monitor.status;
                monitor.error_count = (monitor.error_count || 0) + 1;
                monitor.status = 'error';
                monitor.last_error = result.reason?.message || 'Erreur inconnue';
                monitor.last_error_time = new Date().toISOString();

                // Log activity if status changed
                if (previousStatus !== 'error') {
                    activities.push({
                        id: Date.now(),
                        user_id: decoded.userId,
                        type: 'down',
                        message: `${monitor.name} is offline`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }

        // Mise à jour des statistiques globales pour l'utilisateur
        const updatedStats = {
            totalPings: userStats.totalPings + totalCount,
            successfulPings: userStats.successfulPings + successCount,
            lastPingTime: new Date().toISOString(),
            lastPingCount: totalCount,
            lastSuccessCount: successCount
        };

        allStats[decoded.userId] = updatedStats;

        // Sauvegarde en parallèle
        await Promise.all([
            client.set(MONITORS_KEY, JSON.stringify(allMonitors)),
            client.set(STATS_KEY, JSON.stringify(allStats)),
            client.set(ACTIVITIES_KEY, JSON.stringify(activities))
        ]);

        console.log(`✅ Ping terminé pour l'utilisateur ${decoded.userId}: ${successCount}/${totalCount} succès`);

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
        console.error(`❌ Erreur lors du ping global pour l'utilisateur ${decoded.userId}:`, error);
        return res.status(500).json({
            success: false,
            error: 'Erreur interne lors du ping des services',
            details: error.message
        });
    }
}

async function pingServiceWithRetry(monitor, userId, activities, attempt = 1) {
    const startTime = Date.now();
    
    try {
        console.log(`🔄 Ping ${monitor.name} (tentative ${attempt}) pour l'utilisateur ${userId}`);
        
        // Configuration de la requête
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PING_CONFIG.timeout);
        
        const response = await fetch(monitor.url, {
            method: monitor.type === 'http' ? 'HEAD' : 'GET', // Use HEAD for HTTP, GET for others
            signal: controller.signal,
            headers: {
                'User-Agent': PING_CONFIG.userAgent,
                'Accept': '*/*',
                'Cache-Control': 'no-cache',
                'Connection': 'close'
            },
            redirect: 'manual'
        });
        
        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;
        
        // Considérer les redirections comme des succès
        if (response.ok || (response.status >= 300 && response.status < 400)) {
            console.log(`✅ ${monitor.name}: OK (${response.status}) - ${responseTime}ms`);
            
            return {
                service: monitor.name,
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
            console.log(`⚠️ ${monitor.name}: Erreur, retry dans ${PING_CONFIG.retryDelay}ms`);
            
            await sleep(PING_CONFIG.retryDelay);
            return pingServiceWithRetry(monitor, userId, activities, attempt + 1);
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
        
        console.log(`❌ ${monitor.name}: ${errorMessage} (${responseTime}ms)`);
        
        return {
            service: monitor.name,
            success: false,
            error: errorMessage,
            responseTime: responseTime,
            attempts: attempt
        };
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}