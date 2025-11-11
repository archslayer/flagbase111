/**
 * Initialize Quests System
 * Create collections, indexes, and seed quest definitions
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI or DATABASE_URL not set in .env.local')
}

async function main() {
  console.log('🚀 Initializing Quest System...\n')

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✓ Connected to MongoDB')

    const db = client.db()

    // Create indexes for quest_claims
    console.log('\n📑 Creating indexes...')
    
    await db.collection('quest_claims').createIndex(
      { userId: 1, questKey: 1 },
      { unique: true, name: 'uniq_user_quest' }
    )
    console.log('  ✓ quest_claims (userId, questKey) unique')

    await db.collection('quest_claims').createIndex(
      { discordId: 1, questKey: 1 },
      { unique: true, name: 'uniq_discord_quest' }
    )
    console.log('  ✓ quest_claims (discordId, questKey) unique')

    await db.collection('quest_claims').createIndex(
      { userId: 1, claimedAt: -1 },
      { name: 'idx_user_claims' }
    )
    console.log('  ✓ quest_claims (userId, claimedAt)')

    // Create index for quests_defs
    await db.collection('quests_defs').createIndex(
      { key: 1 },
      { unique: true, name: 'uniq_quest_key' }
    )
    console.log('  ✓ quests_defs (key) unique')

    // Optional index for achv_progress
    await db.collection('achv_progress').createIndex(
      { userId: 1, freeAttacksClaimed: 1 },
      { name: 'idx_free_attacks' }
    )
    console.log('  ✓ achv_progress (userId, freeAttacksClaimed)')

    // Seed quest definition
    console.log('\n🌱 Seeding quest definitions...')
    
    const now = new Date()
    const questDef = {
      key: 'COMMUNICATION_SPECIALIST',
      title: 'Communication Specialist',
      description: 'Join Discord, hold a Flag, get the Flag Folks role.',
      type: 'discord',
      reward: { type: 'free_attack', amount: 1 },
      requirements: {
        discordGuildId: process.env.DISCORD_GUILD_ID,
        discordRoleId: process.env.FLAG_OWNER_ROLE_ID,
        minFlags: 1
      },
      enabled: true,
      createdAt: now,
      updatedAt: now
    }

    await db.collection('quests_defs').updateOne(
      { key: questDef.key },
      { $set: questDef },
      { upsert: true }
    )
    console.log(`  ✓ Quest: ${questDef.title}`)

    console.log('\n✅ Quest system initialized successfully!')
    console.log('\n📊 Summary:')
    console.log('  - Collections: quest_claims, quests_defs')
    console.log('  - Indexes: 5 created')
    console.log('  - Quest definitions: 1 seeded')
  } catch (err) {
    console.error('\n❌ Error:', err)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n✓ MongoDB connection closed')
  }
}

main()
