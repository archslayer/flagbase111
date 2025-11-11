/**
 * Initialize Achievements System
 * 
 * 1. Create MongoDB indexes
 * 2. Seed achievement definitions
 * 3. (Optional) Sync existing user data
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

// Define locally to avoid server-only import issues in scripts
const ACHV_COLLECTIONS = {
  DEFS: 'achv_defs',
  PROGRESS: 'achv_progress',
  MINTS: 'achv_mints',
}

const INITIAL_ACHIEVEMENT_DEFS = [
  {
    category: 1,
    key: 'ATTACK_COUNT',
    title: 'Attack Count',
    description: 'Total number of attacks launched',
    levels: [1, 10, 100, 1000],
    imageBaseURI: '/achievements/attack_count',
    enabled: true,
  },
  {
    category: 2,
    key: 'MULTI_COUNTRY',
    title: 'Multi-Country Attack',
    description: 'Number of distinct countries attacked',
    levels: [1, 5, 15, 35],
    imageBaseURI: '/achievements/multi_country',
    enabled: true,
  },
  {
    category: 3,
    key: 'REFERRAL_COUNT',
    title: 'Referral Count',
    description: 'Number of successful referrals',
    levels: [1, 10, 100, 1000],
    imageBaseURI: '/achievements/referral_count',
    enabled: true,
  },
  {
    category: 5,
    key: 'FLAG_COUNT',
    title: 'Number of Total Flags',
    description: 'Total number of flags owned simultaneously',
    levels: [5, 50, 250, 500],
    imageBaseURI: '/achievements/flag_count',
    enabled: true,
  },
]

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI or DATABASE_URL not set in .env.local')
}

async function main() {
  console.log('🚀 Initializing Achievements System...\n')

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✓ Connected to MongoDB')

    const db = client.db()

    // ════════════════════════════════════════════════════════════════════════════════
    // 1. CREATE INDEXES
    // ════════════════════════════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════════════════════════════
    // CLEAN SLATE: Drop existing collections
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('\n🧹 Cleaning existing data...')

    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)

    for (const collName of Object.values(ACHV_COLLECTIONS)) {
      if (collectionNames.includes(collName)) {
        await db.collection(collName).drop()
        console.log(`  ✓ Dropped collection: ${collName}`)
      }
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // CREATE INDEXES
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('\n📑 Creating indexes...')

    // achv_defs indexes
    await db.collection(ACHV_COLLECTIONS.DEFS).createIndex({ category: 1 }, { unique: true })
    console.log('  ✓ achv_defs: { category: 1 } (unique)')

    await db.collection(ACHV_COLLECTIONS.DEFS).createIndex({ enabled: 1 })
    console.log('  ✓ achv_defs: { enabled: 1 }')

    // achv_progress indexes
    await db.collection(ACHV_COLLECTIONS.PROGRESS).createIndex({ userId: 1 }, { unique: true })
    console.log('  ✓ achv_progress: { userId: 1 } (unique)')

    await db.collection(ACHV_COLLECTIONS.PROGRESS).createIndex({ updatedAt: -1 })
    console.log('  ✓ achv_progress: { updatedAt: -1 }')

    // achv_mints indexes
    await db.collection(ACHV_COLLECTIONS.MINTS).createIndex({
      userId: 1,
      category: 1,
      level: 1,
      status: 1,
    })
    console.log('  ✓ achv_mints: { userId, category, level, status }')

    await db.collection(ACHV_COLLECTIONS.MINTS).createIndex({ txHash: 1 })
    console.log('  ✓ achv_mints: { txHash: 1 }')

    await db.collection(ACHV_COLLECTIONS.MINTS).createIndex({ mintedAt: -1 })
    console.log('  ✓ achv_mints: { mintedAt: -1 }')

    // flags_snapshots indexes
    await db.collection('flags_snapshots').createIndex({ userId: 1, ts: -1 })
    console.log('  ✓ flags_snapshots: { userId: 1, ts: -1 }')

    // attacks collection indexes (for attack event tracking)
    await db.collection('attacks').createIndex({ txHash: 1, logIndex: 1 }, { unique: true })
    console.log('  ✓ attacks: { txHash: 1, logIndex: 1 } (unique)')

    await db.collection('attacks').createIndex({ user: 1, toId: 1, ts: -1 })
    console.log('  ✓ attacks: { user: 1, toId: 1, ts: -1 }')

    await db.collection('attacks').createIndex({ user: 1, ts: -1 })
    console.log('  ✓ attacks: { user: 1, ts: -1 }')

    // ════════════════════════════════════════════════════════════════════════════════
    // 2. SEED ACHIEVEMENT DEFINITIONS
    // ════════════════════════════════════════════════════════════════════════════════

    console.log('\n🌱 Seeding achievement definitions...')

    for (const def of INITIAL_ACHIEVEMENT_DEFS) {
      const existing = await db.collection(ACHV_COLLECTIONS.DEFS).findOne({
        category: def.category,
      })

      if (existing) {
        // Update existing
        await db.collection(ACHV_COLLECTIONS.DEFS).updateOne(
          { category: def.category },
          {
            $set: {
              ...def,
              updatedAt: new Date(),
            },
          }
        )
        console.log(`  ↻ Updated: ${def.title} (category ${def.category})`)
      } else {
        // Insert new
        await db.collection(ACHV_COLLECTIONS.DEFS).insertOne({
          ...def,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        console.log(`  ✓ Inserted: ${def.title} (category ${def.category})`)
      }
    }

    // ════════════════════════════════════════════════════════════════════════════════
    // 3. SUMMARY
    // ════════════════════════════════════════════════════════════════════════════════

    const defsCount = await db.collection(ACHV_COLLECTIONS.DEFS).countDocuments({ enabled: true })
    const progressCount = await db.collection(ACHV_COLLECTIONS.PROGRESS).countDocuments()
    const mintsCount = await db.collection(ACHV_COLLECTIONS.MINTS).countDocuments()

    console.log('\n📊 Summary:')
    console.log(`  • Achievement Definitions: ${defsCount}`)
    console.log(`  • User Progress Records: ${progressCount}`)
    console.log(`  • Total Mints: ${mintsCount}`)

    console.log('\n✅ Achievements system initialized successfully!\n')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

