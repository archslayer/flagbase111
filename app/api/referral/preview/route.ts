// app/api/referral/preview/route.ts
// Preview referral code information

import { NextRequest, NextResponse } from 'next/server'
import { resolveReferralCode } from '@/lib/referral'
import { getAddress } from 'viem'
import { rateLimit } from '@/lib/rl'

export const dynamic = 'force-dynamic'

/**
 * POST /api/referral/preview
 * Preview referral code information
 * Body: { code: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip =
      req.headers.get('x-forwarded-for') ??
      req.headers.get('x-real-ip') ??
      'unknown'
    if (!rateLimit(`referral-preview:${ip}`, 20, 60000)) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { code } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'CODE_REQUIRED' },
        { status: 400 }
      )
    }

    // Resolve referral code
    const resolved = await resolveReferralCode(code.trim().toUpperCase())

    if (!resolved) {
      return NextResponse.json({
        ok: false,
        error: 'INVALID_CODE',
        code: code.trim().toUpperCase(),
      })
    }

    // Get checksummed address
    const refWallet = getAddress(resolved.wallet)

    return NextResponse.json({
      ok: true,
      code: code.trim().toUpperCase(),
      refWallet,
      ownerUserId: resolved.userId || refWallet,
    })
  } catch (error: any) {
    console.error('[ReferralPreview] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'PREVIEW_FAILED' },
      { status: 500 }
    )
  }
}


