/**
 * POST /api/referral/unlock
 * Releases the setReferrer idempotency lock
 * Called when user cancels or transaction fails
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { redisClient } from '@/lib/redis'

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
    
    const checksummedUser = getAddress(userWallet)
    
    // Release lock (idempotent - safe to call multiple times)
    const idempKey = `idemp:${checksummedUser}:setref`
    let wasLocked = false
    
    if (redisClient) {
      const deleted = await redisClient.del(idempKey)
      wasLocked = deleted > 0
      
      if (wasLocked) {
        console.log(`[REFERRAL] Lock released for ${checksummedUser}`)
      } else {
        console.log(`[REFERRAL] Lock already released for ${checksummedUser}`)
      }
    }
    
    return NextResponse.json({
      ok: true,
      message: wasLocked ? 'Lock released' : 'Lock already released',
      wasLocked
    })
    
  } catch (error: any) {
    console.error('[API /referral/unlock] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'UNLOCK_FAILED' },
      { status: 500 }
    )
  }
}

