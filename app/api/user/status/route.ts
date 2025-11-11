import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { getOnboardStatus, setOnboardStatus } from '@/lib/redis-queue'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type User } from '@/lib/schemas/users'

export const runtime = 'nodejs'

/**
 * GET /api/user/status?wallet=0x...
 * 
 * Returns current onboarding status.
 * Falls back to DB check if status not found in Redis.
 */
export async function GET(req: NextRequest) {
  try {
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const wallet = getAddress(userWallet)

    // 1. Check Redis status
    let status = await getOnboardStatus(wallet)

    // 2. Fallback to DB check if no status found
    if (!status) {
      const db = await getDb()
      const collection = db.collection<User>(COLLECTIONS.USERS)
      const user = await collection.findOne({ userId: wallet })

      if (user) {
        // User exists in DB - mark as completed with long TTL
        status = {
          state: 'completed',
          enqueuedAt: user.createdAt.getTime(),
          finishedAt: user.lastLoginAt.getTime()
        }
        await setOnboardStatus(wallet, status, 24 * 60 * 60) // Cache for 24 hours
      } else {
        // User doesn't exist - mark as pending
        status = {
          state: 'pending',
          enqueuedAt: Date.now()
        }
        await setOnboardStatus(wallet, status, 600) // Cache for 10 min
      }
    }

    return NextResponse.json({
      ok: true,
      state: status.state,
      enqueuedAt: status.enqueuedAt
    })

  } catch (error: any) {
    console.error('[API /user/status] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

