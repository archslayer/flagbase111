/**
 * Attack Activity Feed API
 * 
 * GET /api/activity/attacks
 * Returns recent attack events with ETag support for efficient polling
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRecentAttacks, makeAttackEtag } from '@/lib/activity/attacks'
import { getRedis } from '@/lib/redis'

// Alias for consistency
const redisClient = getRedis

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT_RPM = 30
const RATE_LIMIT_WINDOW_SEC = 60

/**
 * Simple IP-based rate limiting
 */
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = await redisClient()
    
    // If Redis is disabled, allow all requests
    if (!redis) {
      return { allowed: true, remaining: RATE_LIMIT_RPM }
    }
    
    const key = `ratelimit:activity:${ip}`
    
    const current = await redis.incr(key)
    
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SEC)
    }
    
    const allowed = current <= RATE_LIMIT_RPM
    const remaining = Math.max(0, RATE_LIMIT_RPM - current)
    
    return { allowed, remaining }
  } catch (error) {
    console.error('[Activity API] Rate limit check failed:', error)
    return { allowed: true, remaining: RATE_LIMIT_RPM }
  }
}

export async function GET(req: NextRequest) {
  try {
    // Get IP for rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
               req.headers.get('x-real-ip') || 
               'unknown'
    
    // Rate limit check
    const rateLimit = await checkRateLimit(ip)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_EXCEEDED' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_RPM),
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(RATE_LIMIT_WINDOW_SEC)
          }
        }
      )
    }
    
    // Get recent attacks
    const items = await getRecentAttacks(10)
    
    // If Redis is not available, return 204 No Content
    // UI will keep showing previous data
    if (!items || items.length === 0) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Cache-Control': 'no-cache',
          'X-RateLimit-Remaining': String(rateLimit.remaining)
        }
      })
    }
    
    // Generate ETag
    const etag = makeAttackEtag(items)
    
    // Check If-None-Match header
    const clientEtag = req.headers.get('if-none-match')
    
    if (clientEtag && clientEtag === etag) {
      // No changes - return 304
      return new NextResponse(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-cache',
          'X-RateLimit-Remaining': String(rateLimit.remaining)
        }
      })
    }
    
    // Return new data
    return NextResponse.json(
      {
        ok: true,
        items,
        count: items.length
      },
      {
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-cache',
          'X-RateLimit-Limit': String(RATE_LIMIT_RPM),
          'X-RateLimit-Remaining': String(rateLimit.remaining)
        }
      }
    )
    
  } catch (error) {
    console.error('[Activity API] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

