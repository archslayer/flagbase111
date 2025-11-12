// lib/initDb.ts
// NEVER: Crash on index creation failure, import-time DB calls
// ALWAYS: Idempotent index creation, graceful error handling
import { getDb } from './mongodb'

export async function ensureIndexes() {
  const db = await getDb()

  // users
  await db.collection('users').createIndex({ wallet: 1 }, { unique: true, name: 'uniq_wallet' })
  await db.collection('users').createIndex({ referralCode: 1 }, { unique: true, name: 'uniq_ref_code', sparse: true })

  // quests
  await db.collection('userQuests').createIndex({ userId: 1, questId: 1 }, { unique: true, name: 'uniq_user_quest' })
  await db.collection('quest_claims').createIndex(
    { wallet: 1, questKey: 1 },
    { unique: true, name: 'uniq_wallet_quest', sparse: true }
  )
  await db.collection('quest_progress').createIndex(
    { wallet: 1, questKey: 1 },
    { unique: true, name: 'uniq_wallet_quest_progress', sparse: true }
  )

  // achievements
  await db.collection('userAchievements').createIndex({ userId: 1, achievementId: 1 }, { unique: true, name: 'uniq_user_ach' })

  // free attacks
  await db.collection('free_attacks').createIndex({ wallet: 1 }, { unique: true, name: 'uniq_wallet_free_attacks' })
  await db.collection('free_attacks').createIndex({ wallet: 1, used: 1 }, { name: 'wallet_used' })

  // quest_claims - additional index for faster lookups
  await db.collection('quest_claims').createIndex({ wallet: 1, claimedAt: -1 }, { name: 'wallet_claimedAt_desc' })

  // price_snapshots - for time-series queries
  await db.collection('price_snapshots').createIndex({ ts: -1 }, { name: 'ts_desc' })

  // idempotency
  await db.collection('idempotency').createIndex({ key: 1 }, { unique: true, name: 'uniq_key' })

  console.log('✅ Indexes ensured')
}
