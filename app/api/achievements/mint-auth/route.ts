import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { getRedis } from '@/lib/redis'
import { isEligibleToMint } from '@/lib/achievements'
import { signMintAuth, type MintAuth } from '@/lib/achievementsSigner'
import { getClientIp, getRateLimitKey } from '@/lib/ip-utils'

export const runtime = 'nodejs'

const PRICE_USDC6 = 200_000n // 0.20 USDC
const DEADLINE_SECONDS = 600 // 10 minutes

// Rate limits
const USER_RATE_LIMIT = { max: 1, window: 30 } // 1 req / 30s per user
const IP_RATE_LIMIT = { max: 5, window: 60 } // 5 req / 60s per IP

/**
 * POST /api/achievements/mint-auth
 * 
 * Generate a signed mint authorization for an eligible achievement.
 * Uses direct EIP-712 signing with Redis cache (2min TTL).
 * Rate limited: 1 req/30s per user, 5 req/60s per IP.
 * 
 * Note: Queue-based signing (optional) can be added via BullMQ if needed.
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
    const { category, level } = body

    if (
      typeof category !== 'number' ||
      typeof level !== 'number' ||
      category < 1 ||
      level < 1
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT' },
        { status: 400 }
      )
    }

    // 3. Get Redis client
    const redisClient = await getRedis()
    if (!redisClient) {
      return NextResponse.json(
        { ok: false, error: 'REDIS_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // 4. Rate limit - User
    const userRlKey = `rl:achv:auth:user:${userId}`
    const userCount = await redisClient.incr(userRlKey)
    if (userCount === 1) {
      await redisClient.expire(userRlKey, USER_RATE_LIMIT.window)
    }
    if (userCount > USER_RATE_LIMIT.max) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_USER', retryAfter: USER_RATE_LIMIT.window },
        { status: 429 }
      )
    }

    // 5. Rate limit - IP
    const clientIp = getClientIp(req)
    const ipRlKey = getRateLimitKey(clientIp, 'rl:achv:auth:ip')
    const ipCount = await redisClient.incr(ipRlKey)
    if (ipCount === 1) {
      await redisClient.expire(ipRlKey, IP_RATE_LIMIT.window)
    }
    if (ipCount > IP_RATE_LIMIT.max) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_IP', retryAfter: IP_RATE_LIMIT.window },
        { status: 429 }
      )
    }

    // 6. Idempotency lock
    const lockKey = `achv:mint:lock:${userId}:${category}:${level}`
    const locked = await redisClient.set(lockKey, '1', { EX: 15, NX: true })
    if (!locked) {
      return NextResponse.json(
        { ok: false, error: 'ALREADY_PROCESSING' },
        { status: 409 }
      )
    }

    try {
      // 7. Check eligibility
      const eligibility = await isEligibleToMint(userId, category, level)
      if (!eligibility.eligible) {
        return NextResponse.json(
          { ok: false, error: eligibility.reason || 'NOT_ELIGIBLE' },
          { status: 422 }
        )
      }

      // 8. Check cache first (avoid re-signing)
      const cacheKey = `achv:mint:auth:${userId}:${category}:${level}`
      const cached = await redisClient.get(cacheKey)
      if (cached) {
        const cachedData = JSON.parse(cached)
        return NextResponse.json({
          ok: true,
          auth: cachedData.auth,
          signature: cachedData.signature,
          cached: true,
        })
      }

      // 9. Generate nonce
      const nonceKey = `achv:nonce:${userId}`
      const nonce = await redisClient.incr(nonceKey)

      // 10. Create auth object
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
      
      const auth: MintAuth = {
        user: userId as `0x${string}`,
        category: BigInt(category),
        level: BigInt(level),
        priceUSDC6: PRICE_USDC6,
        nonce: BigInt(nonce),
        deadline,
      }

      // 10. Sign with EIP-712
      const signature = await signMintAuth(auth)

      // 11. Cache the result (2 minutes)
      const cacheData = {
        auth: {
          user: auth.user,
          category: auth.category.toString(),
          level: auth.level.toString(),
          priceUSDC6: auth.priceUSDC6.toString(),
          nonce: auth.nonce.toString(),
          deadline: auth.deadline.toString(),
        },
        signature,
      }
      await redisClient.set(cacheKey, JSON.stringify(cacheData), { EX: 120 })

      // 12. Return
      return NextResponse.json({
        ok: true,
        auth: cacheData.auth,
        signature,
      })
    } finally {
      // Release lock
      await redisClient.del(lockKey)
    }
  } catch (error: any) {
    console.error('[API /achievements/mint-auth] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

