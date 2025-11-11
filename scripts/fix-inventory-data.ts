/**
 * Fix inventory data by clearing old DB records and cache
 * Then refresh from on-chain data
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { getAddress } from 'viem'
import { Redis } from 'ioredis'

dotenv.config({ path: '.env.local' })

const WALLET = process.argv[2] || '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
const userId = getAddress(WALLET)

const COLLECTIONS = {
  USER_BALANCES: 'user_balances'
} as const

async function getDb() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL
  if (!uri) throw new Error('MONGODB_URI not set')
  const client = new MongoClient(uri)
  await client.connect()
  return client.db()
}

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url === 'false' || process.env.USE_REDIS !== 'true') {
    return null
  }
  return new Redis(url, { maxRetriesPerRequest: null })
}

async function fixInventory() {
  console.log('=== FIXING INVENTORY DATA ===\n')
  console.log(`Wallet: ${userId}\n`)

  // 1. Clear Redis Cache
  console.log('1. Clearing Redis Cache...')
  const redis = getRedis()
  if (redis) {
    const cacheKey = `inv:${userId}`
    const deleted = await redis.del(cacheKey)
    console.log(`   ✅ Deleted ${deleted} cache key(s)`)
  } else {
    console.log('   ⚠️  Redis not available')
  }

  // 2. Clear MongoDB records
  console.log('\n2. Clearing MongoDB records...')
  const db = await getDb()
  const collection = db.collection(COLLECTIONS.USER_BALANCES)
  const result = await collection.deleteMany({ userId })
  console.log(`   ✅ Deleted ${result.deletedCount} record(s) from MongoDB`)

  console.log('\n✅ INVENTORY DATA CLEARED!')
  console.log('\nNext steps:')
  console.log('1. Refresh profile page - it will fetch fresh data from on-chain')
  console.log('2. API will automatically migrate on-chain data to DB')
  console.log('3. New cache will be created with correct values')
  
  await db.client.close()
  if (redis) {
    await redis.quit()
  }
}

fixInventory()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })

