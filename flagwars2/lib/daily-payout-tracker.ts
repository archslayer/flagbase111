/**
 * Daily Payout Tracker - Per-User Daily Cap Enforcement
 * 
 * Tracks individual user payouts per day and enforces per-user daily limits.
 * More granular than global daily cap.
 */

import { Long } from 'mongodb'
import type { Db } from 'mongodb'
import type { Address } from 'viem'

const COLLECTION = 'daily_payouts'

// Daily cap from env or default to 1000 USD
const DEFAULT_CAP = 1_000_000_000n // 1000 USD in micro-USDC (6 decimals)
export const DAILY_CAP_PER_USER_USDC6 = process.env.CLAIM_DAILY_CAP_USDC6 
  ? BigInt(process.env.CLAIM_DAILY_CAP_USDC6)
  : DEFAULT_CAP

/**
 * Get UTC day string (YYYY-MM-DD)
 */
export function dayStrUTC(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/**
 * Get UTC day key (for date comparison)
 */
export function dayKeyUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Record payout after successful claim completion (ATOMIC + CAP-SAFE)
 * 
 * Uses MongoDB Long for precision and atomic increment with cap check.
 * If adding the amount would exceed the cap, the operation fails.
 * 
 * @param db - MongoDB database
 * @param wallet - User wallet (lowercase)
 * @param token - Token address (lowercase)
 * @param amountUSDC6 - Amount in micro-USDC string
 * @returns Updated payout record or null if cap would be exceeded
 */
export async function recordPayout(
  db: Db,
  wallet: string,
  token: string,
  amountUSDC6: string
): Promise<{ total: bigint, hitCap: boolean } | null> {
  const now = new Date()
  const dayStr = dayStrUTC(now)

  // Convert to MongoDB Long for precision
  const inc = Long.fromString(amountUSDC6)
  const cap = Long.fromString(DAILY_CAP_PER_USER_USDC6.toString())

  // First, try to update existing document with cap check (NO upsert)
  const existingResult = await db.collection(COLLECTION).findOneAndUpdate(
    {
      day: dayStr,
      wallet,
      token,
      // Only update if current + inc <= cap
      amountUSDC6: { $lte: cap.subtract(inc) }
    },
    {
      $inc: { amountUSDC6: inc },
      $set: { lastUpdatedAt: now }
    },
    { returnDocument: 'after' }
  )

  if (existingResult) {
    // Document existed and was updated successfully
    const total = BigInt(existingResult.amountUSDC6?.toString() ?? '0')
    
    // Check if user just hit cap
    if (total >= DAILY_CAP_PER_USER_USDC6 && existingResult.hitCap !== true) {
      await db.collection(COLLECTION).updateOne(
        { day: dayStr, wallet, token },
        { $set: { hitCap: true } }
      )

      await db.collection('events').insertOne({
        type: 'DAILY_CAP_HIT',
        day: dayStr,
        wallet,
        token,
        amountUSDC6: total.toString(),
        at: now
      })

      console.log(`[Daily Cap] ⚠️  User ${wallet.slice(0, 10)}... hit daily cap`)
      console.log(`  Amount: ${formatUSDC6(total)} / ${formatUSDC6(DAILY_CAP_PER_USER_USDC6)}`)

      return { total, hitCap: true }
    }

    return { total, hitCap: existingResult.hitCap ?? false }
  }

  // Document doesn't exist yet - try to create it (upsert)
  // First check if amount would exceed cap
  if (BigInt(amountUSDC6) > DAILY_CAP_PER_USER_USDC6) {
    console.log(`[Daily Cap] ⚠️  Initial amount exceeds cap for ${wallet.slice(0, 10)}...`)
    console.log(`  Attempted: ${formatUSDC6(BigInt(amountUSDC6))}`)
    console.log(`  Cap: ${formatUSDC6(DAILY_CAP_PER_USER_USDC6)}`)
    return null
  }

  // Create new document
  const insertResult = await db.collection(COLLECTION).findOneAndUpdate(
    { day: dayStr, wallet, token },
    {
      $setOnInsert: {
        amountUSDC6: inc,
        hitCap: false,
        lastUpdatedAt: now
      }
    },
    { upsert: true, returnDocument: 'after' }
  )

  if (!insertResult) {
    console.log(`[Daily Cap] ⚠️  Failed to create record for ${wallet.slice(0, 10)}...`)
    return null
  }

  const total = BigInt(insertResult.amountUSDC6?.toString() ?? '0')
  return { total, hitCap: false }
}

/**
 * Check if user can receive payout within daily cap
 */
export async function canUserReceivePayout(
  db: Db,
  wallet: string,
  token: string,
  additionalAmount: bigint
): Promise<boolean> {
  const dayStr = dayStrUTC()

  const record = await db.collection(COLLECTION).findOne({
    day: dayStr,
    wallet,
    token
  })

  if (!record) return true // No payouts today

  const currentTotal = BigInt(record.amountUSDC6 ?? 0)
  const newTotal = currentTotal + additionalAmount

  return newTotal <= DAILY_CAP_PER_USER_USDC6
}

/**
 * Get user's daily payout summary
 */
export async function getUserDailySummary(
  db: Db,
  wallet: string,
  token: string
): Promise<{ amount: bigint, hitCap: boolean, remaining: bigint }> {
  const dayStr = dayStrUTC()

  const record = await db.collection(COLLECTION).findOne({
    day: dayStr,
    wallet,
    token
  })

  const amount = BigInt(record?.amountUSDC6 ?? 0)
  const hitCap = record?.hitCap ?? false
  const remaining = DAILY_CAP_PER_USER_USDC6 - amount
  
  return {
    amount,
    hitCap,
    remaining: remaining > 0n ? remaining : 0n
  }
}

/**
 * Format micro-USDC for display
 */
export function formatUSDC6(amount: bigint): string {
  const usdc = (amount / 1000000n).toString()
  const cents = (amount % 1000000n).toString().padStart(6, '0').slice(0, 2)
  return `${usdc}.${cents} USDC`
}

