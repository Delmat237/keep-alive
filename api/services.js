// api/services.js - Version Redis native
import { Redis } from 'ioredis';

const SERVICES_KEY = 'keepalive:services';
const STATS_KEY = 'keepalive:stats';

let redis;

function getRedisClient() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL);
    }
    return redis;
}

export default async function handler(req, res) {
    // Configuration CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getServices(req, res);
            case 'POST':
                return await createService(req, res);
            case 'DELETE':
                return await deleteService(req, res);
            default:
                return res.status(405).json({ 
                    success: false, 
                    error: 'Method not allowed' 
                });
        }
    } catch (error) {
        console.error('API Services Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error' 
        });
    }
}

/**
 * Récupère tous les services
 */
async function getServices(req, res) {
    try {
        const client = getRedisClient();
        
        const [servicesData, statsData] = await Promise.all([
            client.get(SERVICES_KEY),
            client.get(STATS_KEY)
        ]);
        
        const services = servicesData ? JSON.parse(servicesData) : [];
        const stats = statsData ? JSON.parse(statsData) : { totalPings: 0, successfulPings: 0 };
        
        return res.json({ 
            success: true, 
            data: services,
            stats: stats
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch services' 
        });
    }
}

/**
 * Crée un nouveau service
 */
async function createService(req, res) {
    try {
        const { name, url, interval } = req.body;

        // Validation des données
        const validation = validateServiceData(name, url, interval);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }

        const client = getRedisClient();
        
        // Récupération des services existants
        const servicesData = await client.get(SERVICES_KEY);
        const existingServices = servicesData ? JSON.parse(servicesData) : [];

        // Vérification des doublons
        const duplicate = existingServices.find(s => 
            s.url.toLowerCase() === url.toLowerCase()
        );
        
        if (duplicate) {
            return res.status(400).json({ 
                success: false, 
                error: 'Un service avec cette URL existe déjà' 
            });
        }

        // Création du nouveau service
        const newService = {
            id: Date.now(),
            name: name.trim(),
            url: url.trim(),
            interval: parseInt(interval),
            created: new Date().toISOString(),
            lastPing: null,
            status: 'active',
            errorCount: 0,
            responseTime: null
        };

        // Ajout à la liste
        existingServices.push(newService);
        
        // Sauvegarde
        await client.set(SERVICES_KEY, JSON.stringify(existingServices));

        console.log(`New service created: ${name} (${url})`);
        
        return res.json({ 
            success: true, 
            data: newService 
        });

    } catch (error) {
        console.error('Error creating service:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to create service' 
        });
    }
}

/**
 * Supprime un service
 */
async function deleteService(req, res) {
    try {
        const serviceId = parseInt(req.query.id);

        if (!serviceId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Service ID is required' 
            });
        }

        const client = getRedisClient();
        
        // Récupération des services
        const servicesData = await client.get(SERVICES_KEY);
        const services = servicesData ? JSON.parse(servicesData) : [];
        
        // Recherche du service
        const serviceIndex = services.findIndex(s => s.id === serviceId);
        if (serviceIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Service not found' 
            });
        }

        const serviceName = services[serviceIndex].name;

        // Suppression
        services.splice(serviceIndex, 1);
        
        // Sauvegarde
        await client.set(SERVICES_KEY, JSON.stringify(services));

        console.log(`Service deleted: ${serviceName} (ID: ${serviceId})`);
        
        return res.json({ 
            success: true, 
            message: 'Service deleted successfully' 
        });

    } catch (error) {
        console.error('Error deleting service:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to delete service' 
        });
    }
}

/**
 * Valide les données d'un service
 */
function validateServiceData(name, url, interval) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return { 
            valid: false, 
            error: 'Le nom du service doit contenir au moins 2 caractères' 
        };
    }

    if (!url || typeof url !== 'string') {
        return { 
            valid: false, 
            error: 'L\'URL du service est requise' 
        };
    }

    // Validation de l'URL
    try {
        new URL(url);
    } catch {
        return { 
            valid: false, 
            error: 'L\'URL fournie n\'est pas valide' 
        };
    }

    // Validation de l'intervalle
    const intervalNum = parseInt(interval);
    if (!intervalNum || intervalNum < 1 || intervalNum > 60) {
        return { 
            valid: false, 
            error: 'L\'intervalle doit être entre 1 et 60 minutes' 
        };
    }

    return { valid: true };
}