import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

const MONITORS_KEY = 'keepalive:monitors';
const STATS_KEY = 'keepalive:stats';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use environment variable in production

let redis;

function getRedisClient() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL);
    }
    return redis;
}

export default async function handler(req, res) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use GET.'
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
        const client = getRedisClient();

        // Fetch monitors
        const monitorsData = await client.get(MONITORS_KEY);
        const allMonitors = monitorsData ? JSON.parse(monitorsData) : [];
        const userMonitors = allMonitors.filter(m => m.user_id === decoded.userId);

        // Calculate stats
        const totalMonitors = userMonitors.length;
        const upMonitors = userMonitors.filter(m => m.status === 'active').length;
        const downMonitors = userMonitors.filter(m => m.status === 'error').length;
        const pausedMonitors = userMonitors.filter(m => m.status === 'paused').length;
        const validResponseTimes = userMonitors
            .filter(m => m.response_time && m.response_time > 0)
            .map(m => m.response_time);
        const avgResponseTime = validResponseTimes.length > 0
            ? Math.round(validResponseTimes.reduce((sum, time) => sum + time, 0) / validResponseTimes.length)
            : 0;
        const uptime = totalMonitors > 0
            ? ((upMonitors / totalMonitors) * 100).toFixed(1)
            : 100;

        // Fetch existing stats
        const statsData = await client.get(STATS_KEY);
        const allStats = statsData ? JSON.parse(statsData) : {};
        const userStats = allStats[decoded.userId] || {
            totalPings: 0,
            successfulPings: 0,
            lastPingTime: null
        };

        // Update stats
        const updatedStats = {
            ...userStats,
            totalMonitors,
            upMonitors,
            downMonitors,
            pausedMonitors,
            avgResponseTime,
            uptime
        };

        allStats[decoded.userId] = updatedStats;
        await client.set(STATS_KEY, JSON.stringify(allStats));

        console.log(`Stats retrieved for user ${decoded.userId}`);

        return res.json({
            success: true,
            stats: updatedStats
        });
    } catch (error) {
        console.error('Stats API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch stats'
        });
    }
}