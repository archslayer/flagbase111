/**
 * Daily Cap System for Claim Processing
 * 
 * Prevents excessive payouts by enforcing daily limits per token.
 * Configurable via CLAIM_DAILY_CAP_USDC6 env variable.
 * Default: 1000 USD = 1,000,000,000 micro-USDC (6 decimals)
 */

import type { Db } from 'mongodb'
import type { Address } from 'viem'

// Daily cap from env or default to 1000 USD
const DEFAULT_CAP = 1_000_000_000n // 1000 USD in micro-USDC (6 decimals)
export const DAILY_CAP_USDC6 = process.env.CLAIM_DAILY_CAP_USDC6 
  ? BigInt(process.env.CLAIM_DAILY_CAP_USDC6)
  : DEFAULT_CAP

const COLLECTIONS = {
  OFFCHAIN_CLAIMS: 'offchain_claims'
}

/**
 * Get UTC day boundaries
 */
export function dayBoundsUtc(d: Date = new Date()) {
  const start = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
  ))
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

/**
 * Get total processed amount for today (UTC)
 * 
 * Includes both 'processing' and 'completed' claims to prevent
 * race conditions between parallel workers.
 */
export async function getProcessedTodayUSDC6(
  db: Db,
  token: Address
): Promise<bigint> {
  const { start, end } = dayBoundsUtc()

  const result = await db.collection(COLLECTIONS.OFFCHAIN_CLAIMS).aggregate([
    {
      $match: {
        token: token.toLowerCase(),
        status: { $in: ['processing', 'completed'] },
        $or: [
          { processedAt: { $gte: start, $lt: end } },
          { leaseAt: { $gte: start, $lt: end } } // Include leased claims
        ]
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $toLong: '$amount' } }
      }
    }
  ]).toArray()

  return BigInt(result[0]?.total ?? 0)
}

/**
 * Check if claim can be processed within daily cap
 */
export async function canProcessClaim(
  db: Db,
  claimAmountUSDC6: bigint,
  token: Address,
  capLimit: bigint = DAILY_CAP_USDC6
): Promise<boolean> {
  const today = await getProcessedTodayUSDC6(db, token)
  return today + claimAmountUSDC6 <= capLimit
}

/**
 * Get remaining daily cap
 */
export async function getRemainingCap(
  db: Db,
  token: Address,
  capLimit: bigint = DAILY_CAP_USDC6
): Promise<bigint> {
  const today = await getProcessedTodayUSDC6(db, token)
  const remaining = capLimit - today
  return remaining > 0n ? remaining : 0n
}

/**
 * Format micro-USDC for display
 */
export function formatUSDC6(amount: bigint): string {
  const usdc = (amount / 1000000n).toString()
  const cents = (amount % 1000000n).toString().padStart(6, '0').slice(0, 2)
  return `${usdc}.${cents} USDC`
}

