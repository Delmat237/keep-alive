// api/auth/register.js
import { Redis } from 'ioredis';
import bcrypt from 'bcrypt';
import validator from 'validator';

const USERS_KEY = 'keepalive:users';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST.'
        });
    }

    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || name.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Name must be at least 2 characters'
            });
        }

        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email address'
            });
        }

        if (!password || password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        const client = getRedisClient();

        // Fetch existing users
        const usersData = await client.get(USERS_KEY);
        const users = usersData ? JSON.parse(usersData) : [];

        // Check for existing user
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = {
            id: Date.now(),
            name: name.trim(),
            email: email.toLowerCase(),
            password_hash: passwordHash,
            created_at: new Date().toISOString()
        };

        // Add to users list
        users.push(newUser);

        // Save to Redis
        await client.set(USERS_KEY, JSON.stringify(users));

        console.log(`New user registered: ${email}`);

        return res.json({
            success: true,
            message: 'User registered successfully'
        });

    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
}