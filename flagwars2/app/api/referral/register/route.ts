/**
 * POST /api/referral/register
 * Checks if user should call setReferrer on-chain
 * Auth required
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { isSelfReferral } from '@/lib/referral'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type Referral } from '@/lib/schemas/referral'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ABI } from '@/lib/core-abi'
import { redisClient } from '@/lib/redis'
import { getAddress } from 'viem'

export const runtime = 'nodejs'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA!

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
})

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
    
    // Get referral cookie (middleware sets fw_ref_temp with simple base64)
    const tempCookie = req.cookies.get('fw_ref_temp')?.value
    if (!tempCookie) {
      return NextResponse.json(
        { ok: false, reason: 'NO_REF_COOKIE' },
        { status: 400 }
      )
    }
    
    // Decode temp cookie (simple base64, not encrypted)
    let payload: { code: string; refWallet: string; ts: number }
    try {
      const decoded = Buffer.from(tempCookie, 'base64').toString('utf-8')
      payload = JSON.parse(decoded)
      
      if (!payload.code || !payload.refWallet || !payload.ts) {
        throw new Error('Invalid payload structure')
      }
      
      // Check expiry (7 days)
      const age = Date.now() - payload.ts
      if (age > 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json(
          { ok: false, reason: 'EXPIRED_REF_COOKIE' },
          { status: 400 }
        )
      }
    } catch (e) {
      return NextResponse.json(
        { ok: false, reason: 'INVALID_REF_COOKIE' },
        { status: 400 }
      )
    }
    
    // Get refWallet from cookie
    const refWallet = getAddress(payload.refWallet)
    
    // Self-referral check
    if (isSelfReferral(checksummedUser, refWallet)) {
      return NextResponse.json(
        { ok: false, reason: 'SELF_REF' },
        { status: 400 }
      )
    }
    
    // Idempotency check: prevent concurrent requests
    const idempKey = `idemp:${checksummedUser}:setref`
    if (redisClient) {
      const exists = await redisClient.get(idempKey)
      if (exists) {
        return NextResponse.json(
          { ok: false, reason: 'ALREADY_PROCESSING', message: 'Please wait or call /api/referral/unlock if you cancelled' },
          { status: 409 }
        )
      }
      // Set lock for 2 minutes (shorter to reduce UX issues)
      await redisClient.setex(idempKey, 120, '1')
    }
    
    try {
      // Check if user already has a referrer on-chain
      const currentReferrer = await publicClient.readContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'referrerOf',
        args: [checksummedUser as `0x${string}`]
      }) as `0x${string}`
      
      const zeroAddress = '0x0000000000000000000000000000000000000000'
      
      if (currentReferrer && currentReferrer !== zeroAddress) {
        // Already has a referrer - cleanup lock and return
        if (redisClient) {
          await redisClient.del(idempKey)
        }
        
        return NextResponse.json({
          ok: true,
          shouldCallSetReferrer: false,
          reason: 'ALREADY_SET',
          currentReferrer
        })
      }
      
      // Check DB to see if we already have a record (pending confirmation)
      const db = await getDb()
      const existingRef = await db.collection<Referral>(COLLECTIONS.REFERRALS).findOne({
        userId: checksummedUser
      })
      
      if (existingRef && existingRef.confirmedOnChain) {
        // Already confirmed in DB but not on-chain? Shouldn't happen, but handle it
        if (redisClient) {
          await redisClient.del(idempKey)
        }
        
        return NextResponse.json({
          ok: true,
          shouldCallSetReferrer: false,
          reason: 'ALREADY_CONFIRMED'
        })
      }
      
      // All checks passed - user should call setReferrer
      return NextResponse.json({
        ok: true,
        shouldCallSetReferrer: true,
        refWallet,
        code: payload.code
      })
      
    } catch (error) {
      // Cleanup lock on error
      if (redisClient) {
        await redisClient.del(idempKey)
      }
      throw error
    }
    
  } catch (error: any) {
    console.error('[API /referral/register] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'REGISTER_FAILED' },
      { status: 500 }
    )
  }
}

