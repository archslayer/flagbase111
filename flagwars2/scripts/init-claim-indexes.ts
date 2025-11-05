/**
 * Initialize MongoDB Indexes for Claim Processing
 * 
 * Creates optimized indexes for:
 * - Worker queries (status + claimedAt)
 * - User lookup (wallet + status)
 * - Transaction tracking (txHash)
 */

import 'dotenv/config'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env.local first
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

// Direct collection name (avoid server-only import)
const COLLECTIONS = {
  OFFCHAIN_CLAIMS: 'offchain_claims'
}

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'

async function initIndexes() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found in environment')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const collection = db.collection(COLLECTIONS.OFFCHAIN_CLAIMS)

    console.log('\n📊 Creating indexes for offchain_claims...')

    // Index 1: Idempotency key (CRITICAL - prevents double payment)
    // Used by: findOne({ idempoKey: '0x...' })
    await collection.createIndex(
      { idempoKey: 1 },
      { name: 'idempo_key_unique', unique: true }
    )
    console.log('  ✅ idempo_key_unique (idempoKey, UNIQUE) ⭐')

    // Index 2: Worker query optimization
    // Used by: findOneAndUpdate({ status: 'pending' }, sort: { claimedAt: 1 })
    await collection.createIndex(
      { status: 1, claimedAt: 1 },
      { name: 'worker_query_idx' }
    )
    console.log('  ✅ worker_query_idx (status + claimedAt)')

    // Index 3: User lookup
    // Used by: find({ wallet: '0x...', status: 'pending' })
    await collection.createIndex(
      { wallet: 1, status: 1 },
      { name: 'user_lookup_idx' }
    )
    console.log('  ✅ user_lookup_idx (wallet + status)')

    // Index 4: Transaction tracking
    // Used by: findOne({ txHash: '0x...' })
    await collection.createIndex(
      { txHash: 1 },
      { name: 'tx_hash_idx', sparse: true }
    )
    console.log('  ✅ tx_hash_idx (txHash, sparse)')

    // Index 5: Wallet-only lookup (for getTotalClaimable)
    // Used by: find({ wallet: '0x...' })
    await collection.createIndex(
      { wallet: 1 },
      { name: 'wallet_idx' }
    )
    console.log('  ✅ wallet_idx (wallet)')

    // Index 6: Completed claims in last N minutes (for rate metrics)
    // Used by: find({ status: 'completed', processedAt: { $gte: ... } })
    await collection.createIndex(
      { status: 1, processedAt: 1 },
      { name: 'rate_metrics_idx' }
    )
    console.log('  ✅ rate_metrics_idx (status + processedAt)')

    // Index 7: Daily cap calculation (token + processedAt)
    // Used by: daily cap aggregation for specific token
    await collection.createIndex(
      { token: 1, processedAt: 1 },
      { name: 'daily_cap_idx' }
    )
    console.log('  ✅ daily_cap_idx (token + processedAt)')

    // Index 8: Lease recovery (status + leaseAt)
    // Used by: find stuck processing claims
    await collection.createIndex(
      { status: 1, leaseAt: 1 },
      { name: 'lease_recovery_idx' }
    )
    console.log('  ✅ lease_recovery_idx (status + leaseAt)')

    console.log('\n✅ All indexes created successfully!')
    console.log('\nIndex Summary:')
    const indexes = await collection.indexes()
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`)
    })

  } catch (error) {
    console.error('❌ Error creating indexes:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✅ MongoDB connection closed')
  }
}

initIndexes()

