// Attack events consumer worker (separate process)
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { makeWorker } from '../lib/queue'
import { cacheDelPattern } from '../lib/cache'
import { getDb } from '../lib/mongodb'
import { getAddress } from 'viem'
import { syncProgressAfterAttack } from '../lib/achievementsSync'

// Type: event payload (will expand for analytics/db writes)
type AttackJob = {
  user: `0x${string}`
  fromId: number
  toId: number
  amountToken18: string
  txHash: `0x${string}`
  blockNumber?: number | string
  feeUSDC6?: string
  timestamp?: number
}

const processor = makeWorker<AttackJob>('attack-events', async ({ data, id }) => {
  console.log(`[Q:attack-events] start job ${id}`, {
    fromId: data.fromId, 
    toId: data.toId, 
    tx: data.txHash
  })

  // 1) Hot cache invalidation (server-side)
  await Promise.allSettled([
    cacheDelPattern(`country:${data.fromId}*`),
    cacheDelPattern(`country:${data.toId}*`),
    cacheDelPattern(`supply:${data.fromId}*`),
    cacheDelPattern(`supply:${data.toId}*`),
    cacheDelPattern(`quoteBuy:${data.fromId}*`),
    cacheDelPattern(`quoteSell:${data.fromId}*`),
    cacheDelPattern(`quoteBuy:${data.toId}*`),
    cacheDelPattern(`quoteSell:${data.toId}*`),
    cacheDelPattern(`previewAttackFee:${data.user}*`),
    // Clear inventory cache for all users (prices changed, everyone's portfolio value needs refresh)
    cacheDelPattern(`inv:*`),
    // Clear achievements cache for attacker
    cacheDelPattern(`achv:my:${getAddress(data.user)}*`)
  ])

  // 2) Write to DB for audit/analytics (idempotent)
  try {
    const db = await getDb()
    const userLower = getAddress(data.user).toLowerCase()
    const logIndex = 0 // TODO: Extract real logIndex from receipt.logs if available
    
    await db.collection('attacks').updateOne(
      { txHash: data.txHash, logIndex },
      {
        $setOnInsert: {
          user: getAddress(data.user),
          userLower,
          fromId: data.fromId,
          toId: data.toId,
          amountToken18: data.amountToken18,
          txHash: data.txHash,
          logIndex,
          blockNumber: typeof data.blockNumber === 'string' ? parseInt(data.blockNumber, 10) : data.blockNumber || 0,
          feeUSDC6: data.feeUSDC6 || '0',
          ts: new Date(data.timestamp || Date.now()),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )
  } catch (dbError) {
    console.error(`[Q:attack-events] DB write error for job ${id}:`, dbError)
    // Don't fail the job - cache invalidation is more critical
  }

  // 3) Sync achievement progress
  try {
    await syncProgressAfterAttack(data.user, data.toId)
    console.log(`[Q:attack-events] achievement progress synced for ${data.user}`)
  } catch (syncError) {
    console.error(`[Q:attack-events] sync error for job ${id}:`, syncError)
    // Don't fail the job - cache and DB writes are more critical
  }

  console.log(`[Q:attack-events] done job ${id}`)
})

if (!processor) {
  console.log('⚠️  attack-events worker not started (USE_QUEUE=false or Redis off)')
  process.exit(0)
}

console.log('✅ attack-events worker started')

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Q:attack-events] shutting down...')
  if (processor) {
    await processor.worker.close()
    await processor.events.close()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[Q:attack-events] shutting down (SIGTERM)...')
  if (processor) {
    await processor.worker.close()
    await processor.events.close()
  }
  process.exit(0)
})
