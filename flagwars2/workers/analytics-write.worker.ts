// Analytics Write Worker: Append-only audit + atomic stats
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { makeWorker } from '@/lib/queue'
import { getDb, getClient, ensureIndexes } from '@/lib/mongodb'
import { BuySellEvt, AttackEvt } from '@/types/events'

type AnyEvt = { type: 'buy' | 'sell' | 'attack' } & Record<string, any>

// Ensure indexes once at startup
await ensureIndexes()

function dayUTC(tsSec: number) {
  const d = new Date(tsSec * 1000)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

const proc = makeWorker<AnyEvt>('analytics-write', async ({ data }) => {
  // Import Long for precise integer operations
  const { Long } = require('mongodb')
  
  function toI64(s: string) {
    // Convert USDC6 string to int64 without precision loss
    return Long.fromString(s)
  }
  
  const db = await getDb()
  
  // Validate payload
  const ev =
    data.type === 'attack' ? AttackEvt.parse(data)
                           : BuySellEvt.parse(data)
  
  // Normalize wallet to lowercase for consistency
  const wallet = ev.wallet.toLowerCase()
  
  const day = dayUTC(ev.timestamp)
  const eventsCol = db.collection('tx_events')
  
  // 1) Upsert event (idempotent via unique index)
  const up = await eventsCol.updateOne(
    { txHash: ev.txHash, logIndex: ev.logIndex, type: ev.type },
    {
      $setOnInsert: {
        chainId: ev.chainId,
        blockNumber: ev.blockNumber,
        timestamp: ev.timestamp,
        wallet
      },
      $set: ev
    },
    { upsert: true }
  )
  
  // 2) Only update stats if this is a new insert (avoid double-counting)
  if (up.upsertedCount === 1) {
    const stats = db.collection('wallet_stats_daily')
    const inc: Record<string, any> = {}
    
    if (ev.type === 'buy') inc.buyCount = 1
    if (ev.type === 'sell') inc.sellCount = 1
    if (ev.type === 'attack') inc.attackCount = 1
    
    // Use Long for precise integer operations (no precision loss)
    if (ev.feeUSDC6) {
      inc.attackFeeUSDC6 = ev.type === 'attack' ? toI64(ev.feeUSDC6) : 0
    }
    if (ev.type === 'buy' || ev.type === 'sell') {
      // Type narrowing: ev is BuySellEvtT here
      if (ev.quoteIn) inc.volInUSDC6 = toI64(ev.quoteIn)
      if (ev.quoteOut) inc.volOutUSDC6 = toI64(ev.quoteOut)
    }
    
    // Wallet stats
    await stats.updateOne(
      { wallet, day, chainId: ev.chainId },
      {
        $setOnInsert: { wallet, day, chainId: ev.chainId },
        $inc: inc
      },
      { upsert: true }
    )
    
    // Country stats
    const cstats = db.collection('country_stats_daily')
    
    if (ev.type === 'buy' || ev.type === 'sell') {
      // Type narrowing with discriminated union
      const cid = ev.countryId
      await cstats.updateOne(
        { countryId: cid, day, chainId: ev.chainId },
        {
          $setOnInsert: { countryId: cid, day, chainId: ev.chainId },
          $inc:
            ev.type === 'buy'
              ? { buyCount: 1, volInUSDC6: toI64(ev.quoteIn || '0') }
              : { sellCount: 1, volOutUSDC6: toI64(ev.quoteOut || '0') }
        },
        { upsert: true }
      )
    } else {
      // Type is narrowed to AttackEvt
      await Promise.all([
        cstats.updateOne(
          { countryId: ev.fromId, day, chainId: ev.chainId },
          {
            $setOnInsert: { countryId: ev.fromId, day, chainId: ev.chainId },
            $inc: {
              attackOutCount: 1,
              attackFeeUSDC6: toI64(ev.feeUSDC6 || '0')
            }
          },
          { upsert: true }
        ),
        cstats.updateOne(
          { countryId: ev.toId, day, chainId: ev.chainId },
          {
            $setOnInsert: { countryId: ev.toId, day, chainId: ev.chainId },
            $inc: {
              attackInCount: 1,
              attackFeeUSDC6: toI64(ev.feeUSDC6 || '0')
            }
          },
          { upsert: true }
        )
      ])
    }
    
    console.log(`[ANALYTICS] Recorded ${ev.type} tx=${ev.txHash.slice(0, 10)}... wallet=${wallet.slice(0, 8)}... day=${day}`)
  } else {
    console.log(`[ANALYTICS] Skipped duplicate tx=${ev.txHash.slice(0, 10)}... logIndex=${ev.logIndex} type=${ev.type}`)
  }
})

if (!proc) {
  console.log('[ANALYTICS-WORKER] Queue disabled, exiting')
  process.exit(0)
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[ANALYTICS-WORKER] SIGTERM received, closing...')
  if (proc) {
    await proc.worker.close()
    await proc.events.close()
  }
  // Close MongoDB connection
  const mongoClient = getClient()
  if (mongoClient) {
    await mongoClient.close()
    console.log('[ANALYTICS-WORKER] MongoDB connection closed')
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[ANALYTICS-WORKER] SIGINT received, closing...')
  if (proc) {
    await proc.worker.close()
    await proc.events.close()
  }
  // Close MongoDB connection
  const mongoClient = getClient()
  if (mongoClient) {
    await mongoClient.close()
    console.log('[ANALYTICS-WORKER] MongoDB connection closed')
  }
  process.exit(0)
})

console.log('[ANALYTICS-WORKER] Started successfully')

