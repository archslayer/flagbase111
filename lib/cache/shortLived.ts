// lib/cache/shortLived.ts
// Short TTL cache for market prices (Redis with in-memory fallback)
// NEVER: Use for quest/free-attack data, long TTLs
// ALWAYS: Fallback to in-memory if Redis unavailable, configurable TTL

import { getRedis } from '@/lib/redis'

// In-memory fallback cache
const memoryCache: Map<string, { value: any; expiresAt: number }> = new Map()

// Default TTL from env (2 seconds - aligned with poll interval)
const DEFAULT_TTL_SECONDS = process.env.MARKET_PRICE_TTL
  ? parseInt(process.env.MARKET_PRICE_TTL)
  : 2 // 2 seconds default (poll interval is 3s, ensuring cache expires before next poll)

/**
 * Get cached price by key
 * Checks Redis first, falls back to in-memory cache
 */
export async function getCachedPrice(key: string): Promise<any | null> {
  // Try Redis first
  try {
    const redis = await getRedis()
    if (redis) {
      const cached = await redis.get(key)
      if (cached) {
        return JSON.parse(cached)
      }
    }
  } catch (error) {
    // Redis failed, fall back to memory
    console.warn(`[ShortCache] Redis get failed for ${key}, using memory fallback:`, error)
  }

  // Fallback to in-memory cache
  const memEntry = memoryCache.get(key)
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.value
  }

  // Clean up expired entry
  if (memEntry) {
    memoryCache.delete(key)
  }

  return null
}

/**
 * Set cached price with TTL
 * Writes to Redis if available, also stores in memory as fallback
 */
export async function setCachedPrice(key: string, value: any, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000

  // Try Redis first
  try {
    const redis = await getRedis()
    if (redis) {
      await redis.setEx(key, ttlSeconds, JSON.stringify(value))
    }
  } catch (error) {
    // Redis failed, fall back to memory
    console.warn(`[ShortCache] Redis set failed for ${key}, using memory fallback:`, error)
  }

  // Always store in memory as fallback
  memoryCache.set(key, { value, expiresAt })

  // Clean up expired entries periodically (every 100 operations)
  if (memoryCache.size > 100) {
    const now = Date.now()
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiresAt <= now) {
        memoryCache.delete(k)
      }
    }
  }
}

/**
 * Clear a specific cached key
 */
export async function clearCachedPrice(key: string): Promise<void> {
  try {
    const redis = await getRedis()
    if (redis) {
      await redis.del(key)
    }
  } catch (error) {
    // Ignore Redis errors
  }

  memoryCache.delete(key)
}

/**
 * Clear all cached prices (for testing/debugging)
 */
export async function clearAllCachedPrices(): Promise<void> {
  memoryCache.clear()
  // Note: Redis keys are not cleared here (would need pattern matching)
}

