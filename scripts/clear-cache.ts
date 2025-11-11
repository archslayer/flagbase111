/**
 * Clear Redis cache for achievements and related data
 */

import dotenv from 'dotenv'
import { Redis } from 'ioredis'

dotenv.config({ path: '.env.local' })

const REDIS_URL = process.env.REDIS_URL

async function main() {
  if (!REDIS_URL || REDIS_URL === 'false') {
    console.log('⚠️  Redis not configured (REDIS_URL not set)')
    return
  }

  console.log('🔗 Connecting to Redis...')
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

  try {
    // Test connection
    await redis.ping()
    console.log('✅ Redis connected\n')

    // Clear achievement-related caches
    const patterns = [
      'achv:*',           // All achievement caches
      'ach:*',            // Alternative pattern
      'inv:*',            // Inventory caches (may contain achievement data)
    ]

    let totalDeleted = 0

    for (const pattern of patterns) {
      console.log(`🔍 Scanning pattern: ${pattern}`)
      
      const keys: string[] = []
      let cursor = '0'
      
      do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = nextCursor
        keys.push(...batch)
      } while (cursor !== '0')

      if (keys.length > 0) {
        console.log(`  Found ${keys.length} keys`)
        const deleted = await redis.del(...keys)
        totalDeleted += deleted
        console.log(`  ✅ Deleted ${deleted} keys`)
      } else {
        console.log(`  No keys found`)
      }
    }

    console.log(`\n📊 Total deleted: ${totalDeleted} keys`)
    console.log('✅ Cache cleanup complete!')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await redis.quit()
  }
}

main()

