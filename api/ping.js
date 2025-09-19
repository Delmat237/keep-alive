import { kv } from '@vercel/kv';

const SERVICES_KEY = 'keepalive:services';
const STATS_KEY = 'keepalive:stats';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const services = await kv.get(SERVICES_KEY) || [];
    const stats = await kv.get(STATS_KEY) || { totalPings: 0, successfulPings: 0 };
    
    const results = [];

    for (const service of services) {
      try {
        console.log(`Pinging ${service.url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        
        const response = await fetch(service.url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'KeepAlive-Service-Vercel/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          service.lastPing = new Date().toISOString();
          service.status = 'active';
          service.errorCount = 0;
          stats.totalPings++;
          stats.successfulPings++;
          
          results.push({
            service: service.name,
            status: 'success',
            responseCode: response.status
          });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        service.errorCount++;
        service.status = service.errorCount > 3 ? 'error' : 'warning';
        stats.totalPings++;
        
        results.push({
          service: service.name,
          status: 'error',
          error: error.message
        });
      }
    }

    // Sauvegarder les services mis à jour
    await kv.set(SERVICES_KEY, services);
    await kv.set(STATS_KEY, stats);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: results,
      stats: stats
    });

  } catch (error) {
    console.error('Ping Error:', error);
    return res.status(500).json({ error: error.message });
  }
}