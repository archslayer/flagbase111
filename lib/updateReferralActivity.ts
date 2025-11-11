/**
 * Update Referral Activity
 * Marks a user as active when they make their first buy/sell
 * 
 * Uses atomic operations ($min) to prevent race conditions and double-counting.
 * Only updates users with confirmed on-chain referrals.
 * 
 * @server-only
 */

import 'server-only'
import { getDb } from './mongodb'
import { COLLECTIONS, type Referral } from './schemas/referral'
import { getAddress } from 'viem'

/**
 * Update activity after buy transaction (atomic, idempotent)
 * 
 * - Increments totalBuys by 1
 * - Sets isActive to true
 * - Sets firstBuyAt to current time if not already set (using $min)
 * - Only affects users with confirmedOnChain: true
 * 
 * Note: $min keeps the earliest timestamp, so repeated calls won't change firstBuyAt
 */
export async function updateActivityOnBuy(userId: string): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()

  await db.collection<Referral>(COLLECTIONS.REFERRALS).updateOne(
    { userId: checksummed, confirmedOnChain: true },
    {
      $inc: { totalBuys: 1 },
      $set: { isActive: true },
      // $min: sets firstBuyAt if it doesn't exist, or keeps the earlier value
      $min: { firstBuyAt: new Date() }
    }
  )
}

/**
 * Update activity after sell transaction (atomic, idempotent)
 * 
 * - Increments totalSells by 1
 * - Sets isActive to true
 * - Sets firstSellAt to current time if not already set (using $min)
 * - Only affects users with confirmedOnChain: true
 */
export async function updateActivityOnSell(userId: string): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()

  await db.collection<Referral>(COLLECTIONS.REFERRALS).updateOne(
    { userId: checksummed, confirmedOnChain: true },
    {
      $inc: { totalSells: 1 },
      $set: { isActive: true },
      // $min: sets firstSellAt if it doesn't exist, or keeps the earlier value
      $min: { firstSellAt: new Date() }
    }
  )
}

/**
 * Legacy aliases for backwards compatibility
 * These directly call the atomic functions above
 */
export const markFirstBuy = updateActivityOnBuy
export const markFirstSell = updateActivityOnSell
export const incrementBuyCount = updateActivityOnBuy
export const incrementSellCount = updateActivityOnSell
