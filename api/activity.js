import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

const ACTIVITIES_KEY = 'keepalive:activities';
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
        const activitiesData = await client.get(ACTIVITIES_KEY);
        const allActivities = activitiesData ? JSON.parse(activitiesData) : [];
        const userActivities = allActivities
            .filter(a => a.user_id === decoded.userId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 50); // Limit to 50 recent activities

        console.log(`Activities retrieved for user ${decoded.userId}: ${userActivities.length} found`);

        return res.json({
            success: true,
            activities: userActivities
        });
    } catch (error) {
        console.error('Activity API Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch activities'
        });
    }
}