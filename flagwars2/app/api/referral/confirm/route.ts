/**
 * POST /api/referral/confirm
 * Confirms setReferrer transaction and records to DB
 * Auth required
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type Referral } from '@/lib/schemas/referral'
import { getAddress, isHash } from 'viem'
import { redisClient } from '@/lib/redis'

export const runtime = 'nodejs'

interface ConfirmBody {
  txHash: string
  refWallet: string
}

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
    
    // Parse body
    const body: ConfirmBody = await req.json()
    const { txHash, refWallet } = body
    
    // Validate inputs
    if (!txHash || !isHash(txHash)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid txHash' },
        { status: 400 }
      )
    }
    
    let checksummedRef: string
    try {
      checksummedRef = getAddress(refWallet)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid refWallet' },
        { status: 400 }
      )
    }
    
    // Get referral code from temp cookie (optional, for tracking)
    const tempCookie = req.cookies.get('fw_ref_temp')?.value
    let refCode = 'unknown'
    
    if (tempCookie) {
      try {
        const decoded = Buffer.from(tempCookie, 'base64').toString('utf-8')
        const payload = JSON.parse(decoded) as { code?: string }
        if (payload.code) {
          refCode = payload.code
        }
      } catch {
        // Ignore cookie errors
      }
    }
    
    const db = await getDb()
    
    // Upsert referral record (idempotent on userId)
    await db.collection<Referral>(COLLECTIONS.REFERRALS).updateOne(
      { userId: checksummedUser },
      {
        $setOnInsert: {
          userId: checksummedUser,
          wallet: checksummedUser,
          refWallet: checksummedRef,
          refCode,
          txHash,
          confirmedOnChain: true,
          createdAt: new Date(),
          confirmedAt: new Date(),
          totalBuys: 0,
          totalSells: 0,
          isActive: false
        },
        $set: {
          txHash,
          confirmedOnChain: true,
          confirmedAt: new Date()
        }
      },
      { upsert: true }
    )
    
    // Cleanup idempotency lock
    if (redisClient) {
      const idempKey = `idemp:${checksummedUser}:setref`
      await redisClient.del(idempKey)
    }
    
    // Clear referral cookie (referral process is complete)
    const response = NextResponse.json({
      ok: true,
      message: 'Referrer confirmed on-chain'
    })
    
    response.cookies.set('fw_ref_temp', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Delete cookie
      path: '/'
    })
    
    return response
    
  } catch (error: any) {
    console.error('[API /referral/confirm] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'CONFIRM_FAILED' },
      { status: 500 }
    )
  }
}

