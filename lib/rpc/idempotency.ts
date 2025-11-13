// lib/rpc/idempotency.ts
// Transaction idempotency protection for buy/sell/attack operations
// NEVER: Allow duplicate submits, ignore TTL
// ALWAYS: Use deterministic keys, short TTL, Redis or in-memory per instance

import { getRedis } from '../redis'

const IDEMPOTENCY_TTL_SEC = 60 // 60 seconds TTL
const IDEMPOTENCY_PREFIX = 'tx:idempotency:'

/**
 * Generate deterministic idempotency key for transaction intent
 */
export function generateIdempotencyKey(
  user: string,
  action: 'buy' | 'sell' | 'attack',
  params: {
    countryId?: number
    fromId?: number
    toId?: number
    amountToken18?: bigint
    maxCost?: bigint
    minOut?: bigint
    deadline?: bigint
  }
): string {
  const normalizedUser = user.toLowerCase()
  const parts = [
    action,
    normalizedUser,
    params.countryId?.toString() || '',
    params.fromId?.toString() || '',
    params.toId?.toString() || '',
    params.amountToken18?.toString() || '',
    params.maxCost?.toString() || '',
    params.minOut?.toString() || '',
    params.deadline?.toString() || ''
  ]
  
  // Create deterministic hash-like key
  const key = parts.join(':')
  return `${IDEMPOTENCY_PREFIX}${key}`
}

/**
 * Check and acquire idempotency lock
 * Returns true if lock acquired, false if already exists
 */
export async function acquireIdempotencyLock(
  key: string,
  ttlSec: number = IDEMPOTENCY_TTL_SEC
): Promise<{ acquired: boolean; existingHash?: string }> {
  const redis = await getRedis()
  
  if (redis) {
    // Redis-based idempotency (shared across instances)
    try {
      const existing = await redis.get(key)
      if (existing) {
        return {
          acquired: false,
          existingHash: existing
        }
      }
      
      // Set lock with TTL
      await redis.setEx(key, ttlSec, 'pending')
      return { acquired: true }
    } catch (error) {
      // On Redis error, fall back to in-memory
      console.warn('[Idempotency] Redis error, using in-memory fallback:', error)
    }
  }
  
  // In-memory fallback (per-instance, not shared)
  const memoryLocks = new Map<string, { expiresAt: number; hash?: string }>()
  const now = Date.now()
  
  // Cleanup expired entries
  for (const [k, v] of memoryLocks.entries()) {
    if (v.expiresAt <= now) {
      memoryLocks.delete(k)
    }
  }
  
  const existing = memoryLocks.get(key)
  if (existing && existing.expiresAt > now) {
    return {
      acquired: false,
      existingHash: existing.hash
    }
  }
  
  memoryLocks.set(key, {
    expiresAt: now + ttlSec * 1000
  })
  
  return { acquired: true }
}

/**
 * Update idempotency lock with transaction hash
 */
export async function updateIdempotencyLock(
  key: string,
  txHash: string,
  ttlSec: number = IDEMPOTENCY_TTL_SEC
): Promise<void> {
  const redis = await getRedis()
  
  if (redis) {
    try {
      await redis.setEx(key, ttlSec, txHash)
      return
    } catch (error) {
      console.warn('[Idempotency] Redis update error:', error)
    }
  }
  
  // In-memory fallback
  const memoryLocks = new Map<string, { expiresAt: number; hash?: string }>()
  const existing = memoryLocks.get(key)
  if (existing) {
    existing.hash = txHash
    existing.expiresAt = Date.now() + ttlSec * 1000
  }
}

/**
 * Release idempotency lock (on failure)
 */
export async function releaseIdempotencyLock(key: string): Promise<void> {
  const redis = await getRedis()
  
  if (redis) {
    try {
      await redis.del(key)
      return
    } catch (error) {
      console.warn('[Idempotency] Redis release error:', error)
    }
  }
  
  // In-memory fallback
  const memoryLocks = new Map<string, { expiresAt: number; hash?: string }>()
  memoryLocks.delete(key)
}

