/**
 * POST /api/invite/join
 * Join with referral code (simplified on-boarding)
 * 
 * This endpoint:
 * 1. Validates code and wallet
 * 2. Checks self-referral
 * 3. Creates DB record (idempotent)
 * 4. Returns inviter info
 * 
 * Note: This does NOT call setReferrer on-chain. 
 * User must later call /api/referral/register + confirm to bind on-chain.
 * This is just an initial "intent to join" record.
 * 
 * Rate limits: 10/min per code, 10/min per wallet
 */

import { NextRequest, NextResponse } from 'next/server'
import { JoinInviteIn, normalizeWallet, normalizeCode } from '@/lib/schemas/referral-validation'
import { resolveReferralCode, isSelfReferral } from '@/lib/referral'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type Referral } from '@/lib/schemas/referral'
import { getAddress } from 'viem'
import { getRedis } from '@/lib/redis'
import { getClientIp, getRateLimitKey } from '@/lib/ip-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW = 60

async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const r = await getRedis()
  if (!r) return { allowed: true, remaining: RATE_LIMIT_MAX }
  
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
    const validation = JoinInviteIn.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT', details: validation.error.errors },
        { status: 400 }
      )
    }
    
    const { code, wallet } = validation.data
    const checksummedWallet = getAddress(wallet)
    const walletLower = normalizeWallet(checksummedWallet)
    const sanitizedCode = normalizeCode(code)
    
    // Rate limit checks
    const ip = getClientIp(req)
    const codeLimitKey = getRateLimitKey(sanitizedCode, 'ratelimit:join:code')
    const walletLimitKey = getRateLimitKey(normalizeWallet(wallet), 'ratelimit:join:wallet')
    
    const [codeLimit, walletLimit] = await Promise.all([
      checkRateLimit(codeLimitKey),
      checkRateLimit(walletLimitKey)
    ])
    
    if (!codeLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_CODE', message: 'Too many join requests for this code' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    
    if (!walletLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_WALLET', message: 'Too many join requests from this wallet' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    
    // Resolve code to inviter wallet
    const resolved = await resolveReferralCode(sanitizedCode)
    if (!resolved) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_CODE', message: 'Referral code not found' },
        { status: 404 }
      )
    }
    
    const inviterWallet = getAddress(resolved.wallet)
    
    // Self-referral check
    if (isSelfReferral(checksummedWallet, inviterWallet)) {
      return NextResponse.json(
        { ok: false, error: 'SELF_REFERRAL', message: 'Cannot refer yourself' },
        { status: 409 }
      )
    }
    
    // Idempotent DB upsert (intent record)
    const db = await getDb()
    const existing = await db.collection<Referral>(COLLECTIONS.REFERRALS).findOne({
      walletLower
    })
    
    if (existing) {
      // Already joined - return existing inviter (idempotent 200)
      return NextResponse.json({
        ok: true,
        inviter: existing.refWallet,
        code: existing.refCode,
        message: 'Already joined',
        alreadyJoined: true
      }, {
        headers: {
          'X-RateLimit-Code-Remaining': String(codeLimit.remaining),
          'X-RateLimit-Wallet-Remaining': String(walletLimit.remaining)
        }
      })
    }
    
    // Create new referral intent (not yet confirmed on-chain)
    await db.collection<Referral>(COLLECTIONS.REFERRALS).insertOne({
      userId: checksummedWallet,
      wallet: checksummedWallet,
      walletLower,
      refWallet: inviterWallet,
      refWalletLower: normalizeWallet(inviterWallet),
      refCode: sanitizedCode,
      confirmedOnChain: false, // User must call /api/referral/register later
      createdAt: new Date(),
      totalBuys: 0,
      totalSells: 0,
      isActive: false
    })
    
    return NextResponse.json({
      ok: true,
      inviter: inviterWallet,
      code: sanitizedCode,
      message: 'Join successful. Complete on-chain binding via /api/referral/register when logged in.'
    }, {
      status: 201,
      headers: {
        'X-RateLimit-Code-Remaining': String(codeLimit.remaining - 1),
        'X-RateLimit-Wallet-Remaining': String(walletLimit.remaining - 1)
      }
    })
    
  } catch (error: any) {
    console.error('[API /invite/join] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'JOIN_FAILED' },
      { status: 500 }
    )
  }
}

