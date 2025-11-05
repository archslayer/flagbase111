import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { syncProgressAfterTrade, syncProgressAfterAttack } from '@/lib/achievementsSync'

export const runtime = 'nodejs'

/**
 * POST /api/achievements/record
 * 
 * Record user activity for achievement tracking.
 * Called after buy/sell/attack transactions are confirmed.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const userId = getAddress(userWallet)

    // 2. Parse request
    const body = await req.json()
    const { type, targetCountryId } = body

    // 3. Update progress based on activity type
    if (type === 'buy' || type === 'sell') {
      await syncProgressAfterTrade(userId)
    } else if (type === 'attack') {
      if (typeof targetCountryId !== 'number') {
        return NextResponse.json(
          { ok: false, error: 'INVALID_TARGET_COUNTRY' },
          { status: 400 }
        )
      }
      await syncProgressAfterAttack(userId, targetCountryId)
    } else {
      return NextResponse.json(
        { ok: false, error: 'INVALID_TYPE' },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[API /achievements/record] Error:', error)
    // Non-critical - don't fail the request
    return NextResponse.json({ ok: true, warning: error?.message })
  }
}
