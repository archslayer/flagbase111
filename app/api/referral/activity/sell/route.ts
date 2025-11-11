/**
 * POST /api/referral/activity/sell
 * Updates referral activity after a sell transaction
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { updateActivityOnSell } from '@/lib/updateReferralActivity'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    
    // Update activity (non-blocking, fire-and-forget)
    await updateActivityOnSell(userWallet)
    
    return NextResponse.json({
      ok: true,
      message: 'Activity updated'
    })
    
  } catch (error: any) {
    console.error('[API /referral/activity/sell] Error:', error)
    // Don't fail the request, just log
    return NextResponse.json({
      ok: true, // Return OK anyway to not block user flow
      warning: 'Activity update failed'
    })
  }
}

