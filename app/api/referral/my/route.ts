/**
 * GET /api/referral/my
 * Returns user's own referral code and invite link
 * Auth required
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getOrCreateRefCode, generateInviteUrl } from '@/lib/referral'
import { getAddress } from 'viem'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    
    const checksummed = getAddress(userWallet)
    
    // Get or create referral code
    const code = await getOrCreateRefCode(checksummed)
    const inviteUrl = generateInviteUrl(code)
    
    return NextResponse.json({
      ok: true,
      code,
      inviteUrl,
      wallet: checksummed
    })
    
  } catch (error: any) {
    console.error('[API /referral/my] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'FETCH_FAILED' },
      { status: 500 }
    )
  }
}
