/**
 * Daily Cap Helpers
 * 
 * Calculate remaining daily caps for users and global
 */

import { getDb } from './mongodb'
import type { Address } from 'viem'

const DAILY_CAP_PER_USER_USDC6 = BigInt(process.env.CLAIM_DAILY_CAP_USDC6 || '1000000000') // 1000 USDC default
const DAILY_CAP_GLOBAL_USDC6 = BigInt(process.env.CLAIM_DAILY_CAP_GLOBAL_USDC6 || '5000000000') // 5000 USDC default

export function dayStrUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

/**
 * Get user's remaining daily cap
 */
export async function getUserCapLeftUSDC6(wallet: string, day: string): Promise<bigint> {
  const db = await getDb()
  
  const payout = await db.collection('daily_payouts').findOne({
    day,
    wallet: wallet.toLowerCase(),
    token: (process.env.CLAIM_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS || '').toLowerCase()
  })
  
  const usedToday = BigInt(payout?.amountUSDC6?.toString() || '0')
  const remaining = DAILY_CAP_PER_USER_USDC6 - usedToday
  
  return remaining > 0n ? remaining : 0n
}

/**
 * Get global remaining daily cap
 */
export async function getGlobalCapLeftUSDC6(day: string): Promise<bigint> {
  const db = await getDb()
  
  const [result] = await db.collection('daily_payouts').aggregate([
    {
      $match: {
        day,
        token: (process.env.CLAIM_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS || '').toLowerCase()
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $toLong: '$amountUSDC6' } }
      }
    }
  ]).toArray()
  
  const usedToday = BigInt(result?.total?.toString() || '0')
  const remaining = DAILY_CAP_GLOBAL_USDC6 - usedToday
  
  return remaining > 0n ? remaining : 0n
}

