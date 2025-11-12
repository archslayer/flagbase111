// lib/rate-limit.ts
import { getRedis } from './redis'

const KEY_PREFIX = 'inflight:'
const RATE_LIMIT_PREFIX = 'rate:'
const SSE_CONNECTION_PREFIX = 'sse:conn:'

export async function acquireUserInflight (userKey: string, limit = 1, ttlSec = 60) {
  const redis = await getRedis()
  if (!redis) return { ok: true, release: async () => {} }

  const key = KEY_PREFIX + userKey
  const count = await redis.incr(key)
  if (count === 1) {
    // set TTL on first increment
    await redis.expire(key, ttlSec)
  }
  if (count > limit) {
    // revert increment and block
    await redis.decr(key)
    return { ok: false, release: async () => {} }
  }
  return {
    ok: true,
    release: async () => {
      try { await redis.decr(key) } catch {}
    }
  }
}

export async function checkRateLimit(userKey: string, limit = 10, windowSec = 60): Promise<{ ok: boolean, remaining: number, resetTime: number }> {
  const redis = await getRedis()
  if (!redis) return { ok: true, remaining: limit, resetTime: Date.now() + windowSec * 1000 }

  const key = RATE_LIMIT_PREFIX + userKey
  const now = Math.floor(Date.now() / 1000)
  const window = Math.floor(now / windowSec)
  const windowKey = `${key}:${window}`
  
  const count = await redis.incr(windowKey)
  if (count === 1) {
    // Set TTL for the window
    await redis.expire(windowKey, windowSec)
  }
  
  const remaining = Math.max(0, limit - count)
  const resetTime = (window + 1) * windowSec * 1000
  
  return {
    ok: count <= limit,
    remaining,
    resetTime
  }
}

/**
 * SSE Connection Guard
 * Limits the number of concurrent SSE connections per IP
 * 
 * @param ipKey - IP address identifier
 * @param maxConnections - Maximum connections per IP (default: 20)
 * @returns Object with ok flag and release function
 */
export async function acquireSSEConnection(
  ipKey: string,
  maxConnections = 20
): Promise<{ ok: boolean; release: () => Promise<void>; current: number }> {
  const redis = await getRedis()
  
  // Fallback to in-memory if Redis unavailable
  if (!redis) {
    // In-memory connection tracking (per-process, not shared across instances)
    const inMemoryConnections = new Map<string, number>()
    const current = inMemoryConnections.get(ipKey) || 0
    
    if (current >= maxConnections) {
      return {
        ok: false,
        release: async () => {},
        current,
      }
    }
    
    inMemoryConnections.set(ipKey, current + 1)
    
    return {
      ok: true,
      release: async () => {
        const count = inMemoryConnections.get(ipKey) || 0
        if (count > 0) {
          inMemoryConnections.set(ipKey, count - 1)
          if (count === 1) {
            inMemoryConnections.delete(ipKey)
          }
        }
      },
      current: current + 1,
    }
  }

  // Redis-based tracking (shared across instances)
  const key = `${SSE_CONNECTION_PREFIX}${ipKey}`
  
  try {
    const count = await redis.incr(key)
    
    // Set TTL to auto-cleanup stale connections (5 minutes)
    // This handles cases where release() is not called (client disconnect without cleanup)
    if (count === 1) {
      await redis.expire(key, 300) // 5 minutes
    }
    
    if (count > maxConnections) {
      // Revert increment
      await redis.decr(key)
      return {
        ok: false,
        release: async () => {},
        current: count - 1,
      }
    }
    
    return {
      ok: true,
      release: async () => {
        try {
          const current = await redis.decr(key)
          // Cleanup if count reaches 0
          if (current <= 0) {
            await redis.del(key)
          }
        } catch (error) {
          console.error('[SSEConnection] Error releasing connection:', error)
        }
      },
      current: count,
    }
  } catch (error) {
    console.error('[SSEConnection] Error acquiring connection:', error)
    // On error, allow connection (fail open)
    return {
      ok: true,
      release: async () => {},
      current: 0,
    }
  }
}
