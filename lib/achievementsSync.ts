import 'server-only'
import { getDb } from './mongodb'
import { ACHV_COLLECTIONS, type AchievementProgress } from './schemas/achievements'
import { updateEarnedLevels, updateReferralCount } from './achievements'
import { getAddress } from 'viem'
import { getRedis } from './redis'

/**
 * Sync achievement progress from existing activity data.
 * Called on buy/sell/attack to keep metrics up-to-date.
 */

/**
 * Update progress after an attack
 */
export async function syncProgressAfterAttack(
  userId: string,
  targetCountryId: number
): Promise<void> {
  try {
    const checksummed = getAddress(userId)
    const db = await getDb()
    const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

    // Increment attack count
    await collection.updateOne(
      { userId: checksummed },
      {
        $inc: { totalAttacks: 1 },
        $addToSet: { [`attackedCountries`]: targetCountryId } as any,
        $set: { 
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: checksummed,
          distinctCountriesAttacked: 0,
          referralCount: 0,
          flagCount: 0,
          earned: {},
          minted: {},
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )

    // Update distinct countries count
    const progress = await collection.findOne({ userId: checksummed })
    if (progress) {
      const distinctCount = (progress as any).attackedCountries?.length || 0
      await collection.updateOne(
        { userId: checksummed },
        {
          $set: {
            distinctCountriesAttacked: distinctCount,
          },
        }
      )
    }

    // Recalculate earned levels
    await updateEarnedLevels(checksummed)

    // Clear achievements cache
    const redisClient = await getRedis()
    if (redisClient) {
      await redisClient.del(`achv:my:${checksummed}`).catch(() => {})
    }
  } catch (error) {
    console.error('[syncProgressAfterAttack] Error:', error)
  }
}

/**
 * Update progress after buy/sell (for active days tracking)
 */
export async function syncProgressAfterTrade(userId: string): Promise<void> {
  try {
    const checksummed = getAddress(userId)
    const db = await getDb()
    const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

    // Recalculate earned levels (no active days tracking needed)
    await updateEarnedLevels(checksummed)

    // Clear achievements cache
    const redisClient = await getRedis()
    if (redisClient) {
      await redisClient.del(`achv:my:${checksummed}`).catch(() => {})
    }
  } catch (error) {
    console.error('[syncProgressAfterTrade] Error:', error)
  }
}

/**
 * Update progress after a new referral is confirmed
 */
export async function syncProgressAfterReferral(referrerWallet: string): Promise<void> {
  try {
    await updateReferralCount(referrerWallet)
  } catch (error) {
    console.error('[syncProgressAfterReferral] Error:', error)
  }
}


/**
 * Batch sync: Update all users' referral counts from referrals collection
 * (Run this once during deployment or as a cron job)
 */
export async function batchSyncAllReferralCounts(): Promise<void> {
  try {
    const db = await getDb()

    // Get all unique referrers
    const referrers = await db.collection('referrals').distinct('refWallet', {
      confirmedOnChain: true,
    })

    console.log(`[batchSyncAllReferralCounts] Syncing ${referrers.length} referrers...`)

    for (const refWallet of referrers) {
      await updateReferralCount(refWallet)
    }

    console.log('[batchSyncAllReferralCounts] Done!')
  } catch (error) {
    console.error('[batchSyncAllReferralCounts] Error:', error)
  }
}

