import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import validator from 'validator';

const MONITORS_KEY = 'keepalive:monitors';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use environment variable in production

let redis;

function getRedisClient() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL);
    }
    return redis;
}

function validateMonitorData(name, url, type, interval) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
        return { 
            valid: false, 
            error: 'Monitor name must be at least 2 characters' 
        };
    }

    if (!url || typeof url !== 'string' || !validator.isURL(url)) {
        return { 
            valid: false, 
            error: 'Invalid URL provided' 
        };
    }

    const validTypes = ['http', 'ping', 'port'];
    if (!type || !validTypes.includes(type.toLowerCase())) {
        return { 
            valid: false, 
            error: 'Invalid monitor type. Must be http, ping, or port' 
        };
    }

    const intervalNum = parseInt(interval);
    if (!intervalNum || intervalNum < 1 || intervalNum > 60) {
        return { 
            valid: false, 
            error: 'Interval must be between 1 and 60 minutes' 
        };
    }

    return { valid: true };
}

export default async function handler(req, res) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
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
        switch (req.method) {
            case 'GET':
                return await getMonitors(req, res, decoded.userId);
            case 'POST':
                return await createMonitor(req, res, decoded.userId);
            case 'PUT':
                return await updateMonitor(req, res, decoded.userId);
            case 'DELETE':
                return await deleteMonitor(req, res, decoded.userId);
            default:
                return res.status(405).json({ 
                    success: false, 
                    error: 'Method not allowed' 
                });
        }
    } catch (error) {
        console.error('Monitors API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
}

async function getMonitors(req, res, userId) {
    try {
        const client = getRedisClient();
        const monitorsData = await client.get(MONITORS_KEY);
        const allMonitors = monitorsData ? JSON.parse(monitorsData) : [];
        const userMonitors = allMonitors.filter(m => m.user_id === userId);

        return res.json({ 
            success: true, 
            monitors: userMonitors
        });
    } catch (error) {
        console.error('Error fetching monitors:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch monitors' 
        });
    }
}

async function createMonitor(req, res, userId) {
    try {
        const { name, url, type, interval } = req.body;

        // Validate data
        const validation = validateMonitorData(name, url, type, interval);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }

        const client = getRedisClient();
        const monitorsData = await client.get(MONITORS_KEY);
        const monitors = monitorsData ? JSON.parse(monitorsData) : [];

        // Check for duplicate URL for this user
        if (monitors.find(m => m.url.toLowerCase() === url.toLowerCase() && m.user_id === userId)) {
            return res.status(400).json({ 
                success: false, 
                error: 'A monitor with this URL already exists for this user' 
            });
        }

        // Create new monitor
        const newMonitor = {
            id: Date.now(),
            user_id: userId,
            name: name.trim(),
            url: url.trim(),
            type: type.toLowerCase(),
            interval: parseInt(interval),
            status: 'active',
            created_at: new Date().toISOString(),
            last_check: null,
            response_time: null,
            error_count: 0,
            last_error: null
        };

        monitors.push(newMonitor);
        await client.set(MONITORS_KEY, JSON.stringify(monitors));

        console.log(`New monitor created for user ${userId}: ${name} (${url})`);

        return res.json({ 
            success: true, 
            monitor: newMonitor 
        });
    } catch (error) {
        console.error('Error creating monitor:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to create monitor' 
        });
    }
}

async function updateMonitor(req, res, userId) {
    try {
        const { id, name, url, type, interval, status } = req.body;

        if (!id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Monitor ID is required' 
            });
        }

        // Validate data
        const validation = validateMonitorData(name, url, type, interval);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }

        const client = getRedisClient();
        const monitorsData = await client.get(MONITORS_KEY);
        const monitors = monitorsData ? JSON.parse(monitorsData) : [];

        const monitorIndex = monitors.findIndex(m => m.id === id && m.user_id === userId);
        if (monitorIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Monitor not found or unauthorized' 
            });
        }

        // Update monitor
        monitors[monitorIndex] = {
            ...monitors[monitorIndex],
            name: name.trim(),
            url: url.trim(),
            type: type.toLowerCase(),
            interval: parseInt(interval),
            status: status || monitors[monitorIndex].status,
            updated_at: new Date().toISOString()
        };

        await client.set(MONITORS_KEY, JSON.stringify(monitors));

        console.log(`Monitor updated for user ${userId}: ${name} (${url})`);

        return res.json({ 
            success: true, 
            monitor: monitors[monitorIndex] 
        });
    } catch (error) {
        console.error('Error updating monitor:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to update monitor' 
        });
    }
}

async function deleteMonitor(req, res, userId) {
    try {
        const monitorId = parseInt(req.query.id);
        if (!monitorId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Monitor ID is required' 
            });
        }

        const client = getRedisClient();
        const monitorsData = await client.get(MONITORS_KEY);
        const monitors = monitorsData ? JSON.parse(monitorsData) : [];

        const monitorIndex = monitors.findIndex(m => m.id === monitorId && m.user_id === userId);
        if (monitorIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                error: 'Monitor not found or unauthorized' 
            });
        }

        const monitorName = monitors[monitorIndex].name;
        monitors.splice(monitorIndex, 1);
        await client.set(MONITORS_KEY, JSON.stringify(monitors));

        console.log(`Monitor deleted for user ${userId}: ${monitorName} (ID: ${monitorId})`);

        return res.json({ 
            success: true, 
            message: 'Monitor deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting monitor:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to delete monitor' 
        });
    }
}