require('dotenv').config({ path: '.env.local' });

async function testRedisHelper() {
  console.log('🔗 Redis Helper test ediliyor...');
  
  try {
    // Import our Redis helper
    const { getRedis } = require('./lib/redis.js');
    
    console.log('⏳ Redis client alınıyor...');
    const redis = await getRedis();
    
    if (!redis) {
      console.log('⚠️ Redis client null döndü (USE_REDIS=false olabilir)');
      return;
    }
    
    console.log('✅ Redis client başarıyla alındı');
    
    // Test basic operations
    console.log('🧪 Test verisi yazılıyor...');
    await redis.set('helper:test', 'success');
    
    console.log('📖 Test verisi okunuyor...');
    const result = await redis.get('helper:test');
    console.log('📋 Sonuç:', result);
    
    console.log('🧹 Test verisi temizleniyor...');
    await redis.del('helper:test');
    
    // Test idempotency store
    console.log('🔄 Idempotency store test ediliyor...');
    const { begin, load, commit, clear } = require('./idempotency/store.js');
    
    const testKey = 'test:idempotency:key';
    
    console.log('⏳ Idempotency lock alınıyor...');
    const lockAcquired = await begin(testKey);
    console.log('🔒 Lock durumu:', lockAcquired);
    
    console.log('📖 Cache okunuyor...');
    const cached = await load(testKey);
    console.log('📋 Cache durumu:', cached?.status);
    
    console.log('💾 Cache commit ediliyor...');
    await commit(testKey, {
      status: 'SUCCEEDED',
      code: 200,
      ctype: 'application/json',
      body: '{"test": "success"}',
      ts: Date.now()
    });
    
    console.log('📖 Commit sonrası cache okunuyor...');
    const afterCommit = await load(testKey);
    console.log('📋 Commit sonrası durumu:', afterCommit?.status);
    
    console.log('🧹 Cache temizleniyor...');
    await clear(testKey);
    
    console.log('✅ Redis Helper test başarılı!');
    
  } catch (error) {
    console.error('❌ Redis Helper test hatası:', error.message);
    console.error('Stack:', error.stack);
  }
}

testRedisHelper().catch(console.error);
