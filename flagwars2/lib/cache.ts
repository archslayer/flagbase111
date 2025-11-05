// Cache wrapper for Redis (server-only)
import 'server-only'
import { getRedis } from './redis'

const DEFAULT_TTL = 60 // seconds

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const r = await getRedis()
    if (!r) return null
    
    const raw = await r.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (err) {
    console.error('[CACHE] Get error:', err)
    return null
  }
}

export async function cacheSet(key: string, val: unknown, ttl = DEFAULT_TTL) {
  try {
    const r = await getRedis()
    if (!r) return
    
    await r.set(key, JSON.stringify(val), { EX: ttl })
  } catch (err) {
    console.error('[CACHE] Set error:', err)
  }
}

export async function cacheDel(key: string) {
  try {
    const r = await getRedis()
    if (!r) return
    
    await r.del(key)
  } catch (err) {
    console.error('[CACHE] Del error:', err)
  }
}

export async function cacheDelPattern(pattern: string, batchSize = 500) {
  try {
    const r = await getRedis()
    if (!r) return
    
    // Optimized SCAN + batch delete with UNLINK (non-blocking)
    let cursor = 0
    do {
      // node-redis v5 scan returns { cursor: number, keys: string[] }
      const reply = await r.scan(cursor, { MATCH: pattern, COUNT: batchSize })
      cursor = Number(reply.cursor ?? 0)
      
      // Filter out non-string keys (cursor, undefined, numbers)
      const keysRaw = reply.keys ?? []
      const keys = (Array.isArray(keysRaw) ? keysRaw : [])
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
      
      if (keys.length === 0) continue
      
      // Use UNLINK (non-blocking) if available, otherwise DEL
      if (typeof r.unlink === 'function') {
        await r.unlink(keys)
      } else {
        await r.del(keys)
      }
    } while (cursor !== 0)
  } catch (err) {
    console.error('[CACHE] DelPattern error:', err)
  }
}

