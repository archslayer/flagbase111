import { getDb } from './mongodb'

/** quest completion idempotency: user+quest uniq */
export async function ensureProgressIndexes() {
  const db = await getDb()
  await db.collection('questProgress').createIndex(
    { user: 1, questId: 1 }, { unique: true, name: 'uniq_user_quest', background: true }
  )
  await db.collection('achievements').createIndex(
    { user: 1, achievementId: 1 }, { unique: true, name: 'uniq_user_achievement', background: true }
  )
}

/** QUEST: set completed=true (idempotent) */
export async function recordQuestStep(user: string, questId: string, stepKey: string, completed: boolean) {
  const db = await getDb()
  const u = user.toLowerCase()
  await db.collection('questProgress').updateOne(
    { user: u, questId },
    { $setOnInsert: { user: u, questId, createdAt: new Date() }, $set: { [`steps.${stepKey}`]: !!completed, updatedAt: new Date() } },
    { upsert: true }
  )
}

/** ACHIEVEMENT: set earned (idempotent) */
export async function recordAchievement(user: string, achievementId: string, meta?: any) {
  const db = await getDb()
  const u = user.toLowerCase()
  await db.collection('achievements').updateOne(
    { user: u, achievementId },
    { $setOnInsert: { user: u, achievementId, earnedAt: new Date(), meta: meta ?? null } },
    { upsert: true }
  )
}
