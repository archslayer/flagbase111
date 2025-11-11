/**
 * Clear profile inventory cache from Redis
 */

import dotenv from 'dotenv'
import { Redis } from 'ioredis'

dotenv.config({ path: '.env.local' })

// Direct Redis connection without server-only
function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url === 'false' || process.env.USE_REDIS !== 'true') {
    return null
  }
  return new Redis(url, { maxRetriesPerRequest: null })
}

async function clearCache() {
  const redis = await getRedis()
  if (!redis) {
    console.log('❌ Redis not available, skipping...')
    return
  }

  // Find all inventory cache keys
  const pattern = 'inv:*'
  const keys: string[] = []
  
  let cursor = 0
  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = parseInt(nextCursor, 10)
    keys.push(...batch)
  } while (cursor !== 0)

  if (keys.length === 0) {
    console.log('✅ No inventory cache keys found')
    return
  }

  console.log(`Found ${keys.length} cache keys, deleting...`)
  const deleted = await redis.del(...keys)
  console.log(`✅ Deleted ${deleted} cache keys`)
}

clearCache()
  .then(() => {
    console.log('✅ Cache cleared!')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })

