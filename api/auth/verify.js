// api/auth/verify.js
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';

const USERS_KEY = 'keepalive:users';
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

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify JWT
        const decoded = jwt.verify(token, JWT_SECRET);

        const client = getRedisClient();

        // Fetch users
        const usersData = await client.get(USERS_KEY);
        const users = usersData ? JSON.parse(usersData) : [];

        // Find user
        const user = users.find(u => u.id === decoded.userId && u.email === decoded.email);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        console.log(`Token verified for user: ${user.email}`);

        return res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({
            success: false,
            error: error.name === 'JsonWebTokenError' ? 'Invalid token' : 'Token verification failed'
        });
    }
}