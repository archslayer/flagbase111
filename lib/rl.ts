// lib/rl.ts
// NEVER: Leave auth endpoints unlimited
// ALWAYS: Apply rate limiting, migrate to Redis in production
const BUCKET = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now()
  let b = BUCKET.get(key)
  if (!b || b.reset < now) {
    b = { count: 0, reset: now + windowMs }
    BUCKET.set(key, b)
  }
  if (b.count >= limit) return false
  b.count++
  return true
}

// Async version for Redis-backed rate limiting
export async function rateLimitAsync(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining?: number }> {
  // Try Redis first
  const { getRedis } = await import('./redis')
  const redis = await getRedis()
  
  if (redis) {
    const key = `rl:${userId}:${action}`
    const count = await redis.incr(key)
    
    if (count === 1) {
      // First request, set expiry
      await redis.expire(key, windowSeconds)
    }
    
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count)
    }
  }
  
  // Fallback to in-memory
  const key = `${userId}:${action}`
  const windowMs = windowSeconds * 1000
  const allowed = rateLimit(key, limit, windowMs)
  return { allowed }
}