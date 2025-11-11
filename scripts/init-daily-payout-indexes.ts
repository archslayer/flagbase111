/**
 * Initialize MongoDB Indexes for Daily Payouts Collection
 * 
 * Tracks per-user daily payout amounts and cap violations
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'
const COLLECTION = 'daily_payouts'

async function initIndexes() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const collection = db.collection(COLLECTION)

    console.log(`\n📊 Creating indexes for ${COLLECTION}...`)

    // Index 1: Unique constraint per user/token/day
    await collection.createIndex(
      { day: 1, wallet: 1, token: 1 },
      { name: 'day_wallet_token_unique', unique: true }
    )
    console.log('  ✅ day_wallet_token_unique (UNIQUE)')

    // Index 2: Admin list - users who hit cap
    await collection.createIndex(
      { day: 1, hitCap: 1 },
      { name: 'day_hitcap_idx' }
    )
    console.log('  ✅ day_hitcap_idx (day + hitCap)')

    // Index 3: Sorted reports - top spenders
    await collection.createIndex(
      { day: 1, amountUSDC6: -1 },
      { name: 'day_amount_desc_idx' }
    )
    console.log('  ✅ day_amount_desc_idx (day + amount DESC)')

    // Index 4: User history lookup
    await collection.createIndex(
      { wallet: 1, token: 1, day: -1 },
      { name: 'user_history_idx' }
    )
    console.log('  ✅ user_history_idx (wallet + token + day DESC)')

    console.log('\n✅ All indexes created successfully!')
    
    const indexes = await collection.indexes()
    console.log('\nIndex Summary:')
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`)
    })

  } catch (error) {
    console.error('❌ Error creating indexes:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

initIndexes()

