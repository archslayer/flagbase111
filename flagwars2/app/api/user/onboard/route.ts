import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { getClientIp, getRateLimitKey } from '@/lib/ip-utils'
import { 
  acquireOnboardLock, 
  setOnboardStatus, 
  getOnboardStatus,
  xadd 
} from '@/lib/redis-queue'
import { randomUUID } from 'crypto'
import { getRedis } from '@/lib/redis'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type User } from '@/lib/schemas/users'

export const runtime = 'nodejs'

const MAX_ONBOARD_PER_MINUTE_PER_IP = 10
const MAX_ONBOARD_PER_MINUTE_PER_USER = 3

/**
 * POST /api/user/onboard
 * 
 * Adds user to onboarding queue (idempotent).
 * Returns status and redirect URL for /creating page.
 */
export async function POST(req: NextRequest) {
  try {
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const wallet = getAddress(userWallet)
    const ip = getClientIp(req)
    const ua = req.headers.get('user-agent') || 'unknown'
    const requestId = randomUUID()

    // 0) Fast-path: Check if user already completed onboarding
    const existingStatus = await getOnboardStatus(wallet)
    if (existingStatus?.state === 'completed') {
      return NextResponse.json({ ok: true, state: 'completed', redirect: '/market' })
    }

    // 1) DB fast-path: Check if user already exists in DB
    const db = await getDb()
    const users = db.collection<User>(COLLECTIONS.USERS)
    const existingUser = await users.findOne({ userId: wallet }, { projection: { _id: 1 } })

    if (existingUser) {
      // User exists in DB - write completed status to Redis with long TTL
      await setOnboardStatus(wallet, {
        state: 'completed',
        enqueuedAt: Date.now(),
        finishedAt: Date.now()
      }, 24 * 60 * 60) // 24 hours

      return NextResponse.json({ ok: true, state: 'completed', redirect: '/market' })
    }

    // Rate limiting
    const redis = await getRedis()
    if (redis) {
      const ipKey = getRateLimitKey(ip, 'onboard:ip')
      const userKey = `onboard:user:${wallet}`
      
      const ipCount = await redis.incr(ipKey)
      const userCount = await redis.incr(userKey)
      
      if (ipCount === 1) await redis.expire(ipKey, 60)
      if (userCount === 1) await redis.expire(userKey, 60)
      
      if (ipCount > MAX_ONBOARD_PER_MINUTE_PER_IP) {
        return NextResponse.json(
          { ok: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
          { status: 429 }
        )
      }
      
      if (userCount > MAX_ONBOARD_PER_MINUTE_PER_USER) {
        return NextResponse.json(
          { ok: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
          { status: 429 }
        )
      }
    }

    // Try to acquire lock (idempotency check) - 120s TTL for worker safety
    const lockAcquired = await acquireOnboardLock(wallet, 120)
    
    if (!lockAcquired) {
      // Already processing or pending - return current status
      const status = await getOnboardStatus(wallet)
      return NextResponse.json({
        ok: true,
        state: status?.state || 'pending',
        redirect: '/creating'
      })
    }

    // Set initial status
    await setOnboardStatus(wallet, {
      state: 'pending',
      enqueuedAt: Date.now()
    }, 600)

    // Add to queue
    try {
      await xadd('user:onboard:queue', {
        wallet,
        requestId,
        timestamp: Date.now().toString(),
        ip,
        ua: ua.substring(0, 200) // Limit UA length
      })
    } catch (queueError: any) {
      console.error('[ONBOARD] Queue error:', queueError)
      // Release lock on queue failure
      const { releaseOnboardLock } = await import('@/lib/redis-queue')
      await releaseOnboardLock(wallet)
      
      return NextResponse.json(
        { ok: false, error: 'QUEUE_FAILED', message: 'Failed to enqueue onboarding request' },
        { status: 503 }
      )
    }

    return NextResponse.json({
      ok: true,
      state: 'pending',
      redirect: '/creating'
    })

  } catch (error: any) {
    console.error('[API /user/onboard] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

