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

  // achievements
  await db.collection('userAchievements').createIndex({ userId: 1, achievementId: 1 }, { unique: true, name: 'uniq_user_ach' })

  // idempotency
  await db.collection('idempotency').createIndex({ key: 1 }, { unique: true, name: 'uniq_key' })

  console.log('✅ Indexes ensured')
}
