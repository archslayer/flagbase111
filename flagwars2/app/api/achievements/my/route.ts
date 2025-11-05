import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress } from 'viem'
import { getOrCreateProgress, getAllDefinitions } from '@/lib/achievements'
import { redisClient } from '@/lib/redis'

export const runtime = 'nodejs'

const CACHE_TTL = 5 // 5 seconds

/**
 * GET /api/achievements/my
 * 
 * Get user's achievement progress, earned levels, minted levels, and definitions.
 */
export async function GET(req: NextRequest) {
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

    // 2. Check cache
    if (redisClient) {
      const cacheKey = `achv:my:${userId}`
      const cached = await redisClient.get(cacheKey)
      if (cached) {
        const data = JSON.parse(cached)
        return NextResponse.json({
          ...data,
          cached: true,
        })
      }
    }

    // 3. Get user progress
    const progress = await getOrCreateProgress(userId)

    // 4. Get all definitions
    const defs = await getAllDefinitions()

    // 5. Prepare response
    const response = {
      ok: true,
      earned: progress.earned,
      minted: progress.minted,
      progress: {
        totalAttacks: progress.totalAttacks,
        distinctCountriesAttacked: progress.distinctCountriesAttacked,
        referralCount: progress.referralCount,
        flagCount: progress.flagCount,
      },
      defs: defs.map(def => ({
        category: def.category,
        key: def.key,
        title: def.title,
        description: def.description,
        levels: def.levels,
        imageBaseURI: def.imageBaseURI,
      })),
    }

    // 6. Cache response
    if (redisClient) {
      const cacheKey = `achv:my:${userId}`
      await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(response))
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[API /achievements/my] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

