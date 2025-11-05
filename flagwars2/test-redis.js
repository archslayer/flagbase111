const { createClient } = require('redis');

async function testRedis() {
  console.log('🔗 Redis bağlantısı test ediliyor...');
  
  const client = createClient({
    username: 'default',
    password: '3M2ZCzSlGcUu9XGl3tCsG5wG2sdFkrDk',
    socket: {
      host: 'redis-18236.c261.us-east-1-4.ec2.redns.redis-cloud.com',
      port: 18236
    }
  });

  client.on('error', err => {
    console.error('❌ Redis Client Error:', err.message);
  });

  client.on('connect', () => {
    console.log('✅ Redis bağlantısı kuruldu');
  });

  try {
    console.log('⏳ Bağlanıyor...');
    await client.connect();
    
    console.log('🧪 Test verisi yazılıyor...');
    await client.set('test:connection', 'success');
    
    console.log('📖 Test verisi okunuyor...');
    const result = await client.get('test:connection');
    console.log('📋 Sonuç:', result);
    
    console.log('🧹 Test verisi temizleniyor...');
    await client.del('test:connection');
    
    console.log('✅ Redis test başarılı!');
    
  } catch (error) {
    console.error('❌ Redis test hatası:', error.message);
  } finally {
    console.log('🔌 Bağlantı kapatılıyor...');
    await client.disconnect();
    console.log('✅ Test tamamlandı');
  }
}

testRedis().catch(console.error);
