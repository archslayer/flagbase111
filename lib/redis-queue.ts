import { getRedis } from './redis'
import { getRedisWorker } from './redis-worker'

export interface OnboardStatus {
  state: 'pending' | 'processing' | 'completed' | 'failed'
  enqueuedAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
}

/**
 * Redis Streams helper for user onboarding queue
 */
export async function xadd(queue: string, fields: Record<string, string | number>): Promise<string> {
  // Use worker client for better reliability
  const redis = await getRedisWorker()
  
  // Convert all values to strings (Redis requirement)
  const stringFields: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    stringFields[key] = String(value)
  }
  
  // Add message (TRIM removed due to API compatibility)
  const id = await redis.xAdd(queue, '*', stringFields)
  return id
}

/**
 * Create consumer group if it doesn't exist
 */
export async function ensureConsumerGroup(stream: string, group: string): Promise<void> {
  const redis = await getRedisWorker()
  
  try {
    // Use '$' to start consuming from new messages only (no backlog)
    await redis.xGroupCreate(stream, group, '$', { MKSTREAM: true })
  } catch (err: any) {
    if (err.message?.includes('BUSYGROUP')) {
      // Group already exists, that's OK
      return
    }
    throw err
  }
}

/**
 * Read messages from a consumer group
 */
export async function xreadgroup(
  group: string,
  consumer: string,
  stream: string,
  count: number = 10,
  block: number = 5000
): Promise<Array<{ id: string; message: Record<string, string> }>> {
  try {
    const redis = await getRedisWorker()
    
    // Correct node-redis v4 API signature:
    // xReadGroup(group, consumer, streams[], options?)
    const result = await redis.xReadGroup(
      group,
      consumer,
      [{ key: stream, id: '>' }],
      { COUNT: count, BLOCK: block }
    )
    
    // node-redis returns null on timeout
    if (!result || result.length === 0) return []
    
    // Return structure: [{ name, messages: [{ id, message }, ...] }]
    const messages = result[0]?.messages ?? []
    return messages
  } catch (err: any) {
    console.error('[REDIS:xreadgroup] Error:', err?.message || err)
    throw err
  }
}

/**
 * Acknowledge a message
 */
export async function xack(group: string, stream: string, id: string): Promise<void> {
  const redis = await getRedisWorker()
  
  await redis.xAck(stream, group, id)
}

/**
 * Set onboarding status
 */
export async function setOnboardStatus(
  wallet: string,
  status: OnboardStatus,
  ttl: number = 600
): Promise<void> {
  try {
    const redis = await getRedisWorker()
    const key = `user:onboard:status:${wallet}`
    await redis.set(key, JSON.stringify(status), { EX: ttl })
  } catch (err) {
    console.error('[REDIS:worker] Failed to set status:', err)
  }
}

/**
 * Get onboarding status
 */
export async function getOnboardStatus(wallet: string): Promise<OnboardStatus | null> {
  try {
    const redis = await getRedisWorker()
    const key = `user:onboard:status:${wallet}`
    const data = await redis.get(key)
    if (!data) return null
    
    return JSON.parse(data) as OnboardStatus
  } catch (err) {
    console.error('[REDIS:worker] Failed to get status:', err)
    return null
  }
}

/**
 * Acquire lock for onboarding (idempotency)
 */
export async function acquireOnboardLock(wallet: string, ttl: number = 30): Promise<boolean> {
  try {
    const redis = await getRedisWorker()
    const key = `user:onboard:lock:${wallet}`
    const result = await redis.set(key, '1', { EX: ttl, NX: true })
    return result === 'OK'
  } catch (err) {
    console.error('[REDIS:worker] Failed to acquire lock:', err)
    return false
  }
}

/**
 * Release onboarding lock
 */
export async function releaseOnboardLock(wallet: string): Promise<void> {
  try {
    const redis = await getRedisWorker()
    const key = `user:onboard:lock:${wallet}`
    await redis.del(key)
  } catch (err) {
    console.error('[REDIS:worker] Failed to release lock:', err)
  }
}

/**
 * Add to dead letter queue
 */
export async function addToDLQ(
  wallet: string,
  error: string,
  payload: Record<string, string>
): Promise<void> {
  try {
    const redis = await getRedisWorker()
    await redis.xAdd('user:onboard:dlq', '*', {
      wallet,
      error,
      payload: JSON.stringify(payload),
      timestamp: Date.now().toString()
    })
  } catch (err) {
    console.error('[REDIS:worker] Failed to add to DLQ:', err)
  }
}

