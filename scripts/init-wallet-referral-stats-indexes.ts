/**
 * Initialize Wallet Referral Stats Indexes
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'
const COLLECTION = 'wallet_referral_stats'

async function main() {
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

    // Index 1: Unique wallet
    await collection.createIndex(
      { wallet: 1 },
      { name: 'wallet_unique', unique: true }
    )
    console.log('  ✅ wallet_unique (UNIQUE)')

    // Index 2: Query by active referrals (for leaderboards)
    await collection.createIndex(
      { activeReferrals: -1 },
      { name: 'active_referrals_desc' }
    )
    console.log('  ✅ active_referrals_desc')

    // Index 3: Query by total referrals
    await collection.createIndex(
      { totalReferrals: -1 },
      { name: 'total_referrals_desc' }
    )
    console.log('  ✅ total_referrals_desc')

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

main()

