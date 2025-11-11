import 'dotenv/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') })

import { getDb } from '../lib/mongodb'
import { COLLECTIONS, type User } from '../lib/schemas/users'
import { getAddress } from 'viem'
import {
  ensureConsumerGroup, xreadgroup, xack,
  setOnboardStatus, releaseOnboardLock, addToDLQ, xadd
} from '../lib/redis-queue'
import { getRedisWorker, quitRedisWorker } from '../lib/redis-worker'

const CONSUMER_GROUP = 'user-onboarders'
const CONSUMER_NAME = `worker-${process.pid}`
const STREAM_NAME = 'user:onboard:queue'
const BATCH_SIZE = 10
const BLOCK_MS = 15000  // longer block is fine with reconnect
const MAX_RETRIES = 3

async function processMessage(messageId: string, fields: Record<string, string>) {
  const { wallet, requestId } = fields
  try {
    console.log(`[ONBOARDER] Processing ${wallet} (${requestId})`)
    await setOnboardStatus(wallet, {
      state: 'processing',
      enqueuedAt: Number(fields.timestamp || Date.now()),
      startedAt: Date.now()
    }, 600)

    const db = await getDb()
    const collection = db.collection<User>(COLLECTIONS.USERS)
    const now = new Date()
    const result = await collection.updateOne(
      { userId: wallet },
      { $setOnInsert: { createdAt: now }, $set: { lastLoginAt: now } },
      { upsert: true }
    )

    console.log(`[ONBOARDER] DB upsert: upserted=${result.upsertedCount}, modified=${result.modifiedCount}`)

    await setOnboardStatus(wallet, {
      state: 'completed',
      enqueuedAt: Number(fields.timestamp || Date.now()),
      startedAt: Date.now(),
      finishedAt: Date.now()
    }, 24 * 60 * 60) // 24 hours

    await releaseOnboardLock(wallet)
    await xack(CONSUMER_GROUP, STREAM_NAME, messageId)
    console.log(`[ONBOARDER] ✅ Completed ${wallet}`)
  } catch (error: any) {
    console.error(`[ONBOARDER] ❌ Error for ${wallet}:`, error)

    if (error?.code === 11000) {
      // duplicate userId – treat as success
      await setOnboardStatus(wallet, {
        state: 'completed',
        enqueuedAt: Number(fields.timestamp || Date.now()),
        finishedAt: Date.now()
      }, 24 * 60 * 60) // 24 hours
      await releaseOnboardLock(wallet)
      await xack(CONSUMER_GROUP, STREAM_NAME, messageId)
      return
    }

    const retryCount = parseInt(fields.retryCount || '0')
    if (retryCount < MAX_RETRIES) {
      console.warn(`[ONBOARDER] Requeue ${wallet} attempt ${retryCount + 1}/${MAX_RETRIES}`)
      await xadd(STREAM_NAME, { ...fields, retryCount: String(retryCount + 1), timestamp: String(Date.now()) })
      await xack(CONSUMER_GROUP, STREAM_NAME, messageId)
    } else {
      console.warn(`[ONBOARDER] DLQ ${wallet}`)
      await addToDLQ(wallet, error?.message || 'UNKNOWN', fields)
      await setOnboardStatus(wallet, {
        state: 'failed',
        enqueuedAt: Number(fields.timestamp || Date.now()),
        error: error?.message || 'UNKNOWN'
      }, 900)
      await releaseOnboardLock(wallet)
      await xack(CONSUMER_GROUP, STREAM_NAME, messageId)
    }
  }
}

// Heartbeat to keep the connection "active" and detect silent drops
async function heartbeat() {
  try {
    const r = await getRedisWorker()
    await r.ping()
  } catch (e) {
    console.warn('[ONBOARDER] heartbeat failed, will reconnect on next loop', e?.toString?.() || e)
  }
}

async function runWorker() {
  console.log('[ONBOARDER] Starting worker...')
  // Ensure client and group
  await getRedisWorker()
  await ensureConsumerGroup(STREAM_NAME, CONSUMER_GROUP)
  console.log(`[ONBOARDER] Consumer group ensured: ${CONSUMER_GROUP}`)
  console.log(`[ONBOARDER] Waiting for messages on ${STREAM_NAME}...`)

  // periodic heartbeat
  setInterval(heartbeat, 20000)

  while (true) {
    try {
      const messages = await xreadgroup(CONSUMER_GROUP, CONSUMER_NAME, STREAM_NAME, BATCH_SIZE, BLOCK_MS)
      if (messages.length === 0) continue

      await Promise.all(messages.map(msg =>
        processMessage(msg.id, msg.message as Record<string, string>)
      ))
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('[ONBOARDER] Loop error:', msg)

      // Handle connection closed / socket issues by forcing a reconnect
      if (msg.includes('ClientClosedError') || msg.includes('The client is closed') || msg.includes('ECONNRESET')) {
        try {
          await quitRedisWorker()
        } catch {}
        // Let next loop iteration call getRedisWorker() again
      }

      // brief pause to avoid tight loop
      await new Promise(res => setTimeout(res, 2000))
    }
  }
}

// graceful shutdown
process.on('SIGTERM', async () => { console.log('[ONBOARDER] SIGTERM'); await quitRedisWorker(); process.exit(0) })
process.on('SIGINT', async () => { console.log('[ONBOARDER] SIGINT'); await quitRedisWorker(); process.exit(0) })

runWorker().catch(async (e) => {
  console.error('[ONBOARDER] Fatal:', e)
  await quitRedisWorker()
  process.exit(1)
})
