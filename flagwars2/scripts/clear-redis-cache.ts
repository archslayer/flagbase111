import dotenv from 'dotenv'
import { getRedis } from '../lib/redis'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function clearRedisCache() {
  try {
    console.log('🗑️  Clearing Redis cache...')
    
    const redis = await getRedis()
    
    if (!redis) {
      console.log('❌ Redis not available')
      return
    }
    
    // Clear all inventory cache keys
    const keys = await redis.keys('inv:*')
    console.log(`🔍 Found ${keys.length} inventory cache keys`)
    
    if (keys.length > 0) {
      await redis.del(keys)
      console.log(`✅ Cleared ${keys.length} inventory cache keys`)
    }
    
    // Clear price cache keys
    const priceKeys = await redis.keys('price:*')
    console.log(`🔍 Found ${priceKeys.length} price cache keys`)
    
    if (priceKeys.length > 0) {
      await redis.del(priceKeys)
      console.log(`✅ Cleared ${priceKeys.length} price cache keys`)
    }
    
    // Clear all cache keys (if needed)
    const allKeys = await redis.keys('*')
    console.log(`🔍 Total Redis keys: ${allKeys.length}`)
    
    if (allKeys.length > 0) {
      console.log('📋 Sample keys:')
      allKeys.slice(0, 10).forEach((key, i) => {
        console.log(`  ${i + 1}. ${key}`)
      })
    }
    
    console.log('🎉 Redis cache cleared successfully!')
    
  } catch (error) {
    console.error('❌ Error clearing Redis cache:', error)
    process.exit(1)
  }
}

// Run the cleanup
clearRedisCache().then(() => {
  console.log('✅ Script completed')
  process.exit(0)
}).catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
