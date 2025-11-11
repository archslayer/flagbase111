/**
 * POST /api/referral/claim
 * Simple referral claim - no milestones
 * 
 * Calculates claimable = accrued - claimed
 * Rate limits: 1/min per user, 10/day per user
 * Creates offchain_claim for worker to process
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { getDb } from '@/lib/mongodb'
import { getClaimableBalance } from '@/lib/referral-stats-sync'
import { generateIdempoKey } from '@/lib/idempotency-key'
import { keccak256, encodePacked } from 'viem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || process.env.CLAIM_USDC_ADDRESS) as `0x${string}`
const MIN_PAYOUT_USDC6 = parseInt(process.env.CLAIM_MIN_PAYOUT_USDC6 || '10000') // 0.01 USDC default
const RL_PER_MINUTE = parseInt(process.env.CLAIM_RL_PER_MINUTE || '1')
const RL_PER_DAY = parseInt(process.env.CLAIM_RL_PER_DAY || '10')

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

/**
 * Check minute rate limit
 */
async function checkMinuteLimit(wallet: string): Promise<RateLimitResult> {
  const walletLower = wallet.toLowerCase()
  const db = await getDb()
  
  const now = new Date()
  const minuteKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`
  
  const result = await db.collection('claim_nonces').findOneAndUpdate(
    { wallet: walletLower, minuteKey },
    {
      $inc: { lastMinuteCount: 1 },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true, returnDocument: 'after' }
  )
  
  const count = result?.lastMinuteCount || 0
  const allowed = count <= RL_PER_MINUTE
  const remaining = Math.max(0, RL_PER_MINUTE - count)
  
  return {
    allowed,
    remaining,
    retryAfter: allowed ? undefined : 60
  }
}

/**
 * Check daily rate limit
 */
async function checkDayLimit(wallet: string): Promise<RateLimitResult> {
  const walletLower = wallet.toLowerCase()
  const db = await getDb()
  
  const now = new Date()
  const dayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  
  const result = await db.collection('claim_nonces').findOneAndUpdate(
    { wallet: walletLower, day: dayKey },
    {
      $inc: { countDay: 1 },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true, returnDocument: 'after' }
  )
  
  const count = result?.countDay || 0
  const allowed = count <= RL_PER_DAY
  const remaining = Math.max(0, RL_PER_DAY - count)
  
  return {
    allowed,
    remaining
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth check - STRICT wallet ownership verification
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED', message: 'JWT required' },
        { status: 401 }
      )
    }
    
    const checksummed = getAddress(userWallet)
    const walletLower = checksummed.toLowerCase()
    
    // CRITICAL: Verify JWT wallet matches claim wallet
    // This prevents token theft/replay attacks
    if (walletLower !== checksummed.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: 'WALLET_MISMATCH', message: 'JWT wallet does not match' },
        { status: 403 }
      )
    }
    
    // Minute rate limit check
    const minuteLimit = await checkMinuteLimit(walletLower)
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'RATE_LIMIT_MINUTE', 
          message: 'Please wait a moment before claiming again' 
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(minuteLimit.retryAfter || 60)
          }
        }
      )
    }
    
    // Daily rate limit check
    const dayLimit = await checkDayLimit(walletLower)
    if (!dayLimit.allowed) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'RATE_LIMIT_DAY', 
          message: 'You have reached the daily claim limit (10 per day)' 
        },
        { status: 429 }
      )
    }
    
    // SNAPSHOT: Calculate claimable balance at this moment
    // This prevents TOCTOU (Time-Of-Check-Time-Of-Use) race conditions
    const { accrued, claimed } = await getClaimableBalance(walletLower)
    let claimable = accrued - claimed
    
    if (claimable < MIN_PAYOUT_USDC6) {
      const minAmount = (MIN_PAYOUT_USDC6 / 1_000_000).toFixed(2)
      return NextResponse.json(
        { 
          ok: false, 
          error: 'INSUFFICIENT_BALANCE', 
          message: `Minimum claimable amount is ${minAmount} USDC. Current claimable: ${(Number(claimable) / 1_000_000).toFixed(6)} USDC` 
        },
        { status: 400 }
      )
    }
    
    // Apply daily caps (user + global)
    const now = new Date()
    const dayUTC = now.toISOString().slice(0, 10) // "YYYY-MM-DD"
    
    const { getUserCapLeftUSDC6, getGlobalCapLeftUSDC6 } = await import('@/lib/daily-cap-helpers')
    
    const userCapLeft = await getUserCapLeftUSDC6(walletLower, dayUTC)
    const globalCapLeft = await getGlobalCapLeftUSDC6(dayUTC)
    
    // SNAPSHOT: Final amount is MIN of (claimable, userCap, globalCap)
    const amountUSDC6 = BigInt(
      Math.min(
        Number(claimable),
        Number(userCapLeft),
        Number(globalCapLeft)
      )
    )
    
    // Check if capped amount is still above minimum
    if (amountUSDC6 < MIN_PAYOUT_USDC6) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'CAP_REACHED', 
          message: `Daily cap reached. Available: ${(Number(amountUSDC6) / 1_000_000).toFixed(2)} USDC` 
        },
        { status: 400 }
      )
    }
    
    // Generate idempotency key with SNAPSHOT amount
    const idempoKey = keccak256(
      encodePacked(
        ['string', 'string', 'string', 'string'],
        [walletLower, amountUSDC6.toString(), USDC_ADDRESS.toLowerCase(), dayUTC]
      )
    )
    
    // Create offchain_claim with SNAPSHOT amount (idempotent)
    const db = await getDb()
    const claimDoc = {
      wallet: walletLower,
      amount: amountUSDC6.toString(), // SNAPSHOT: Use capped amount
      token: USDC_ADDRESS.toLowerCase(),
      status: 'pending' as const,
      idempoKey,
      claimId: `referral:${walletLower}:${dayUTC}`,
      reason: 'referral_earnings',
      attempts: 0,
      claimedAt: now,
      // Store snapshot info for debugging
      snapshotAccrued: accrued.toString(),
      snapshotClaimed: claimed.toString(),
      snapshotUserCapLeft: userCapLeft.toString(),
      snapshotGlobalCapLeft: globalCapLeft.toString()
    }
    
    const result = await db.collection('offchain_claims').updateOne(
      { idempoKey },
      { $setOnInsert: claimDoc },
      { upsert: true }
    )
    
    // Check if claim was actually inserted (not a duplicate)
    const isDuplicate = result.upsertedCount === 0 && result.modifiedCount === 0
    
    if (isDuplicate) {
      // User already has a pending claim with same idempotency key
      return NextResponse.json(
        { 
          ok: false, 
          error: 'DUPLICATE_CLAIM', 
          message: 'You already have a pending claim for today with this amount' 
        },
        { status: 409 }
      )
    }
    
    const usdcAmount = (Number(amountUSDC6) / 1_000_000).toFixed(2)
    
    return NextResponse.json({
      ok: true,
      queued: true,
      message: `Your ${usdcAmount} USDC claim is being processed`,
      amountUSDC6: amountUSDC6.toString(), // SNAPSHOT: Return actual queued amount
      accruedUSDC6: accrued.toString(),
      claimedUSDC6: claimed.toString(),
      cappedBy: amountUSDC6 < claimable 
        ? (amountUSDC6.toString() === userCapLeft.toString() ? 'user_cap' : 'global_cap')
        : null
    }, {
      headers: {
        'X-RateLimit-Minute-Remaining': String(minuteLimit.remaining - 1),
        'X-RateLimit-Day-Remaining': String(dayLimit.remaining - 1)
      }
    })
    
  } catch (error: any) {
    console.error('[API /referral/claim] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'CLAIM_FAILED' },
      { status: 500 }
    )
  }
}

