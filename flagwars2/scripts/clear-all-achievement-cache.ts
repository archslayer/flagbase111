/**
 * Clear ALL achievement-related caches
 */

import dotenv from 'dotenv'
import { Redis } from 'ioredis'
import { exec } from 'child_process'
import { promisify } from 'util'

dotenv.config({ path: '.env.local' })

const execAsync = promisify(exec)

async function clearRedis() {
  const REDIS_URL = process.env.REDIS_URL

  if (!REDIS_URL || REDIS_URL === 'false') {
    console.log('⚠️  Redis not configured')
    return { deleted: 0 }
  }

  console.log('🔗 Connecting to Redis...')
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null })

  try {
    await redis.ping()
    console.log('✅ Redis connected\n')

    const patterns = [
      'achv:*',
      'ach:*',
      'achievement:*',
      'inv:*',  // Inventory may cache achievement-related data
    ]

    let totalDeleted = 0

    for (const pattern of patterns) {
      console.log(`🔍 Scanning: ${pattern}`)
      
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

    // Flush all if needed (be careful!)
    // await redis.flushdb()
    // console.log('⚠️  Flushed entire Redis database')

    return { deleted: totalDeleted }
  } catch (error: any) {
    console.error('❌ Redis error:', error.message)
    return { deleted: 0, error: error.message }
  } finally {
    await redis.quit()
  }
}

async function clearNextJsCache() {
  console.log('\n📦 Clearing Next.js build cache...')
  
  try {
    // Remove .next directory
    if (process.platform === 'win32') {
      await execAsync('rmdir /s /q .next 2>nul || echo No .next directory')
    } else {
      await execAsync('rm -rf .next')
    }
    console.log('  ✅ .next directory removed')

    // Clear other caches
    const dirs = ['node_modules/.cache', '.turbo']
    for (const dir of dirs) {
      try {
        if (process.platform === 'win32') {
          await execAsync(`if exist ${dir} rmdir /s /q ${dir}`)
        } else {
          await execAsync(`rm -rf ${dir}`)
        }
        console.log(`  ✅ ${dir} removed`)
      } catch (e) {
        // Ignore if doesn't exist
      }
    }
  } catch (error: any) {
    console.error('  ⚠️  Error:', error.message)
  }
}

async function main() {
  console.log('🧹 === FULL CACHE CLEANUP ===\n')

  // 1. Redis
  const redisResult = await clearRedis()
  console.log(`\n📊 Redis: Deleted ${redisResult.deleted} keys`)

  // 2. Next.js
  await clearNextJsCache()

  console.log('\n✅ === CACHE CLEANUP COMPLETE ===\n')
  console.log('Sonraki adımlar:')
  console.log('  1. Browser\'da hard refresh: Ctrl+Shift+R (veya Cmd+Shift+R)')
  console.log('  2. Dev server\'ı yeniden başlat: npm run dev')
  console.log('  3. Incognito/Private mode\'da test et\n')
}

main()

