/**
 * GET /api/referral/resolve?code=CODE
 * Resolves referral code to wallet address
 * Rate limit: 20/min per IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveReferralCode } from '@/lib/referral'
import { redisClient } from '@/lib/redis'
import { getClientIp, getRateLimitKey } from '@/lib/ip-utils'

export const runtime = 'nodejs'

// Redis cache TTL
const CACHE_TTL = 300 // 5 minutes

// Rate limit: 20/min per IP
const RATE_LIMIT_WINDOW = 60
const RATE_LIMIT_MAX = 20

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!redisClient) {
    return { allowed: true, remaining: RATE_LIMIT_MAX }
  }
  
  const key = getRateLimitKey(ip, 'ratelimit:resolve')
  const current = await redisClient.incr(key)
  
  if (current === 1) {
    await redisClient.expire(key, RATE_LIMIT_WINDOW)
  }
  
  const remaining = Math.max(0, RATE_LIMIT_MAX - current)
  
  return {
    allowed: current <= RATE_LIMIT_MAX,
    remaining
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Get client IP (safely handles CDN/proxy)
    const ip = getClientIp(req)
    
    // Rate limit check
    const rateLimit = await checkRateLimit(ip)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_EXCEEDED' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(RATE_LIMIT_WINDOW)
          }
        }
      )
    }
    
    // Get code from query params
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    
    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Missing code parameter' },
        { status: 400 }
      )
    }
    
    // Validate code format
    const sanitized = code.toUpperCase().replace(/[^A-Z2-7]/g, '')
    if (sanitized.length < 8 || sanitized.length > 12) {
      return NextResponse.json(
        { ok: false, error: 'Invalid code format' },
        { status: 400 }
      )
    }
    
    // Check Redis cache first
    let result = null
    if (redisClient) {
      const cacheKey = `refcode:${sanitized}`
      const cached = await redisClient.get(cacheKey)
      
      if (cached) {
        result = JSON.parse(cached)
      } else {
        // Resolve from DB
        result = await resolveReferralCode(sanitized)
        
        if (result) {
          // Cache for 5 minutes
          await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(result))
        }
      }
    } else {
      result = await resolveReferralCode(sanitized)
    }
    
    if (!result) {
      return NextResponse.json(
        { ok: false, error: 'Code not found' },
        { status: 404 }
      )
    }
    
    const duration = Date.now() - startTime
    
    return NextResponse.json(
      { 
        ok: true, 
        refWallet: result.wallet,
        ownerUserId: result.userId
      },
      {
        headers: {
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-Response-Time': `${duration}ms`
        }
      }
    )
    
  } catch (error: any) {
    console.error('[API /referral/resolve] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'RESOLVE_FAILED' },
      { status: 500 }
    )
  }
}

