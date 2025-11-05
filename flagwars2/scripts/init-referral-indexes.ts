/**
 * Initialize MongoDB indexes for referral system
 * Run with: npx tsx scripts/init-referral-indexes.ts
 */

import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'

// Collection names (copied from lib/schemas/referral.ts to avoid server-only import)
const COLLECTIONS = {
  REF_CODES: 'ref_codes',
  REFERRALS: 'referrals',
  CLAIM_NONCES: 'claims_nonces',
  OFFCHAIN_CLAIMS: 'offchain_claims'
} as const

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

    // ref_codes collection
    console.log('\n📦 Creating indexes for ref_codes...')
    await db.collection(COLLECTIONS.REF_CODES).createIndexes([
      { key: { userId: 1 }, unique: true, name: 'userId_unique' },
      { key: { wallet: 1 }, name: 'wallet_idx' },
      { key: { code: 1 }, unique: true, name: 'code_unique' },
      { key: { createdAt: 1 }, name: 'createdAt_idx' }
    ])
    console.log('✅ ref_codes indexes created')

    // referrals collection
    console.log('\n📦 Creating indexes for referrals...')
    await db.collection(COLLECTIONS.REFERRALS).createIndexes([
      { key: { userId: 1 }, unique: true, name: 'userId_unique' },
      { key: { walletLower: 1 }, unique: true, name: 'walletLower_unique' },
      { key: { refWallet: 1 }, name: 'refWallet_idx' },
      { key: { refWalletLower: 1 }, name: 'refWalletLower_idx' },
      { key: { refCode: 1 }, name: 'refCode_idx' },
      { key: { confirmedOnChain: 1 }, name: 'confirmedOnChain_idx' },
      { key: { isActive: 1 }, name: 'isActive_idx' },
      { key: { createdAt: 1 }, name: 'createdAt_idx' },
      // Compound index for stats queries
      { key: { refWalletLower: 1, confirmedOnChain: 1, isActive: 1 }, name: 'stats_compound_lower' },
      // Compound index for activity updates (fast lookup for confirmed users)
      { key: { walletLower: 1, confirmedOnChain: 1 }, name: 'activity_update_lower' }
    ])
    console.log('✅ referrals indexes created')

    // claims_nonces collection
    console.log('\n📦 Creating indexes for claims_nonces...')
    await db.collection(COLLECTIONS.CLAIM_NONCES).createIndexes([
      { key: { userId: 1 }, unique: true, name: 'userId_unique' },
      { key: { lastClaimAt: 1 }, name: 'lastClaimAt_idx' },
      { key: { dayStartedAt: 1 }, name: 'dayStartedAt_idx' }
    ])
    console.log('✅ claims_nonces indexes created')

    // offchain_claims collection
    console.log('\n📦 Creating indexes for offchain_claims...')
    await db.collection(COLLECTIONS.OFFCHAIN_CLAIMS).createIndexes([
      { key: { userId: 1 }, name: 'userId_idx' },
      { key: { status: 1 }, name: 'status_idx' },
      { key: { reason: 1 }, name: 'reason_idx' },
      { key: { claimedAt: 1 }, name: 'claimedAt_idx' },
      // Compound index for user claims
      { key: { userId: 1, status: 1 }, name: 'user_status_compound' }
    ])
    console.log('✅ offchain_claims indexes created')

    console.log('\n✅ All referral indexes created successfully!')

  } catch (error) {
    console.error('❌ Error creating indexes:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

initIndexes()

