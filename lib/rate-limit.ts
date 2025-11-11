import { getRedis } from './redis'

const KEY_PREFIX = 'inflight:'
const RATE_LIMIT_PREFIX = 'rate:'

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


