// test-kv.js - Test de connexion à Vercel KV
import { kv } from '@vercel/kv';

async function testKVConnection() {
    try {
        console.log('🔄 Test de connexion à Vercel KV...');
        
        // Test d'écriture
        await kv.set('test:connection', {
            message: 'Hello from Keep-Alive Service!',
            timestamp: new Date().toISOString()
        });
        
        console.log('✅ Écriture réussie');
        
        // Test de lecture
        const data = await kv.get('test:connection');
        console.log('✅ Lecture réussie:', data);
        
        // Test de suppression
        await kv.del('test:connection');
        console.log('✅ Suppression réussie');
        
        console.log('🎉 Vercel KV fonctionne parfaitement !');
        
    } catch (error) {
        console.error('❌ Erreur Vercel KV:', error);
        console.log('\n🔧 Solutions possibles:');
        console.log('1. Vérifiez que la base KV est créée dans le dashboard');
        console.log('2. Vérifiez que le projet est connecté à la base');
        console.log('3. Exécutez: vercel env pull .env.local');
        console.log('4. Vérifiez les variables KV_REST_API_URL et KV_REST_API_TOKEN');
    }
}

testKVConnection();