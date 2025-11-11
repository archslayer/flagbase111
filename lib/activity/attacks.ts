/**
 * Attack Activity Feed - Redis Producer
 * 
 * Pushes attack events to Redis for recent activity display
 */

import { createHash } from 'crypto'
import { getRedis } from '@/lib/redis'

// Alias for consistency
const redisClient = getRedis

const RECENT_LIST_KEY = 'attack:recent'
const DEDUP_KEY_PREFIX = 'attack:dedup:'
const MAX_RECENT_ITEMS = 1000
const DEDUP_TTL_SEC = 86400 // 24 hours

export interface AttackEvent {
  attackId: string          // Unique ID: txHash:logIndex
  ts: number               // Unix timestamp (seconds)
  blockNumber: number
  logIndex: number
  attacker: string         // Wallet address (lowercase)
  attackerCountry: string  // Country code (e.g., "TR")
  defenderCode: string     // Country code (e.g., "US")
  delta: string            // Delta amount (string for precision)
  feeUSDC6: string         // Fee in micro-USDC (string)
  txHash: string           // Transaction hash
}

/**
 * Push attack event to Redis recent list with deduplication
 */
export async function pushAttackEvent(event: AttackEvent): Promise<void> {
  try {
    const redis = await redisClient()
    
    // If Redis is not available, silently skip
    if (!redis) {
      console.warn('[Activity] Redis not available, skipping attack event push')
      return
    }
    
    const dedupKey = `${DEDUP_KEY_PREFIX}${event.attackId}`
    
    // Pipeline: dedup check + push + trim
    const result = await redis.multi()
      .set(dedupKey, '1', { NX: true, EX: DEDUP_TTL_SEC })
      .lPush(RECENT_LIST_KEY, JSON.stringify(event))
      .lTrim(RECENT_LIST_KEY, 0, MAX_RECENT_ITEMS - 1)
      .exec()
    
    console.log('[Activity] Pipeline result:', {
      setnx: result?.[0],
      lpush: result?.[1],
      ltrim: result?.[2],
      dedupKey,
      listKey: RECENT_LIST_KEY
    })
    
    // Check if dedup key was set (first element of pipeline result)
    const wasNew = (result?.[0] as any) === 'OK'
    
    if (!wasNew) {
      console.log(`[Activity] Duplicate attack event skipped: ${event.attackId}`)
    } else {
      console.log(`[Activity] Attack event pushed: ${event.attackId}`)
    }
  } catch (error) {
    console.error('[Activity] Failed to push attack event:', error)
    // Don't throw - this is non-critical
  }
}

/**
 * Get recent attack events (for API endpoint)
 */
export async function getRecentAttacks(limit: number = 10): Promise<AttackEvent[]> {
  try {
    const redis = await redisClient()
    
    // If Redis is not available, return empty array
    if (!redis) {
      console.warn('[Activity] Redis not available, returning empty attacks list')
      return []
    }
    
    const items = await redis.lRange(RECENT_LIST_KEY, 0, limit - 1)
    
    console.log('[Activity] Read from Redis:', {
      listKey: RECENT_LIST_KEY,
      count: items.length,
      firstItem: items[0] ? items[0].slice(0, 100) + '...' : 'none'
    })
    
    const parsed = items.map((item: string) => {
      try {
        return JSON.parse(item) as AttackEvent
      } catch (err) {
        console.error('[Activity] Failed to parse item:', err)
        return null
      }
    }).filter((item: AttackEvent | null): item is AttackEvent => item !== null)
    
    console.log('[Activity] Parsed attacks:', parsed.length)
    
    return parsed
  } catch (error) {
    console.error('[Activity] Failed to get recent attacks:', error)
    return []
  }
}

/**
 * Generate ETag for attack list (for 304 responses)
 */
export function makeAttackEtag(items: AttackEvent[]): string {
  if (!items.length) {
    return 'W/"empty"'
  }
  
  const first = items[0].attackId
  const last = items[items.length - 1].attackId
  const count = items.length
  
  const hash = createHash('md5')
    .update(`${first}:${last}:${count}`)
    .digest('hex')
    .slice(0, 16)
  
  return `W/"${hash}"`
}

/**
 * Get activity health info
 */
export async function getActivityHealth() {
  try {
    const redis = await redisClient()
    
    // If Redis is not available
    if (!redis) {
      return {
        ok: true, // System is OK, just Redis is disabled
        redisConnected: false,
        recentAttacksCount: 0,
        message: 'Redis is disabled (USE_REDIS=false)'
      }
    }
    
    // Ping Redis
    await redis.ping()
    
    // Get list length
    const count = await redis.lLen(RECENT_LIST_KEY)
    
    return {
      ok: true,
      redisConnected: true,
      recentAttacksCount: count
    }
  } catch (error) {
    return {
      ok: false,
      redisConnected: false,
      recentAttacksCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

