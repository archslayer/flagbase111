// Idempotency lock for preventing duplicate operations
import { getRedis } from './redis'

export async function acquireOnce(key: string, ttl = 30): Promise<boolean> {
  try {
    const r = await getRedis()
    if (!r) return true // If Redis is down, allow operation (fail-open)
    
    // SETNX with expiration
    const result = await r.set(key, '1', { NX: true, EX: ttl })
    return result === 'OK'
  } catch (err) {
    console.error('[IDEM] acquireOnce error:', err)
    return true // Fail-open on error
  }
}

export async function releaseOnce(key: string) {
  try {
    const r = await getRedis()
    if (!r) return
    
    await r.del(key)
  } catch (err) {
    console.error('[IDEM] releaseOnce error:', err)
  }
}

export async function isLocked(key: string): Promise<boolean> {
  try {
    const r = await getRedis()
    if (!r) return false
    
    const exists = await r.exists(key)
    return exists === 1
  } catch (err) {
    console.error('[IDEM] isLocked error:', err)
    return false
  }
}

