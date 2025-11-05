/**
 * POST /api/referral/preview
 * Preview claimable rewards without actually claiming
 * 
 * Returns:
 * - pendingAmountUSDC6: Total claimable amount
 * - count: Number of pending claims
 * - eligible: Whether user is currently eligible for new claim
 * - nextReward: Next available milestone
 * 
 * Auth not required (public preview by wallet)
 * Rate limit: 20/min per IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { ClaimPreviewIn } from '@/lib/schemas/referral-validation'
import { checkClaimEligibility, getTotalClaimable } from '@/lib/referralRewards'
import { getAddress } from 'viem'
import { getRedis } from '@/lib/redis'
import { getClientIp, getRateLimitKey } from '@/lib/ip-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW = 60

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const r = await getRedis()
  if (!r) return { allowed: true, remaining: RATE_LIMIT_MAX }
  
  const key = getRateLimitKey(ip, 'ratelimit:preview')
  const current = await r.incr(key)
  
  if (current === 1) {
    await r.expire(key, RATE_LIMIT_WINDOW)
  }
  
  const remaining = Math.max(0, RATE_LIMIT_MAX - current)
  return {
    allowed: current <= RATE_LIMIT_MAX,
    remaining
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse and validate body
    const body = await req.json()
    const validation = ClaimPreviewIn.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT', details: validation.error.errors },
        { status: 400 }
      )
    }
    
    const { wallet } = validation.data
    const checksummed = getAddress(wallet)
    const walletLower = checksummed.toLowerCase()
    
    // Rate limit check
    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit(ip)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_EXCEEDED' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    
    // Get eligibility (checks milestones and already-claimed)
    const eligibility = await checkClaimEligibility(walletLower)
    
    // Get total claimable from pending/processing claims
    const pendingAmountUSDC6 = await getTotalClaimable(walletLower)
    
    // Count how many pending claims (for UI)
    const count = pendingAmountUSDC6 === '0' ? 0 : 1 // Simplified (could query DB for exact count)
    
    return NextResponse.json({
      ok: true,
      pendingAmountUSDC6,
      count,
      eligible: eligibility.eligible,
      nextReward: eligibility.eligible ? {
        amount: eligibility.amount,
        reason: eligibility.reason
      } : null,
      message: eligibility.eligible 
        ? `You can claim ${eligibility.reason}` 
        : (eligibility.error || 'No rewards available')
    }, {
      headers: {
        'X-RateLimit-Remaining': String(rateLimit.remaining)
      }
    })
    
  } catch (error: any) {
    console.error('[API /referral/preview] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'PREVIEW_FAILED' },
      { status: 500 }
    )
  }
}

