// Utilisation de Vercel KV pour la persistance
import { kv } from '@vercel/kv';

const SERVICES_KEY = 'keepalive:services';

export default async function handler(req, res) {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    switch (req.method) {
      case 'GET':
        const services = await kv.get(SERVICES_KEY) || [];
        return res.json({ success: true, data: services });

      case 'POST':
        const newService = {
          id: Date.now(),
          name: req.body.name,
          url: req.body.url,
          interval: parseInt(req.body.interval),
          created: new Date().toISOString(),
          lastPing: null,
          status: 'active',
          errorCount: 0
        };
        
        const currentServices = await kv.get(SERVICES_KEY) || [];
        currentServices.push(newService);
        await kv.set(SERVICES_KEY, currentServices);
        
        return res.json({ success: true, data: newService });

      case 'DELETE':
        const serviceId = parseInt(req.query.id);
        const services_list = await kv.get(SERVICES_KEY) || [];
        const updatedServices = services_list.filter(s => s.id !== serviceId);
        await kv.set(SERVICES_KEY, updatedServices);
        
        return res.json({ success: true });

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}