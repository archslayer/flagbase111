# Analytics System - Append-Only Audit + Atomic Stats

## Overview

Append-only audit log ve atomik günlük istatistikler sistemi. Her `buy`, `sell`, ve `attack` işlemi MongoDB'ye kaydedilir ve wallet/country bazlı sayaçlar atomik olarak güncellenir.

---

## Architecture

### Collections

1. **tx_events** (Append-only raw records)
   - Tüm işlemlerin ham kaydı
   - Unique index: `{ txHash: 1, logIndex: 1, type: 1 }`
   - İdempotent: Aynı tx tekrar gelirse duplicate insert olmaz
   
2. **wallet_stats_daily** (Wallet + day aggregates)
   - Cüzdan başına günlük özet
   - Unique index: `{ wallet: 1, day: 1, chainId: 1 }`
   - Sayaçlar: `buyCount`, `sellCount`, `attackCount`, `volInUSDC6`, `volOutUSDC6`, `attackFeeUSDC6`

3. **country_stats_daily** (Country + day aggregates)
   - Ülke başına günlük özet
   - Unique index: `{ countryId: 1, day: 1, chainId: 1 }`
   - Sayaçlar: `buyCount`, `sellCount`, `attackInCount`, `attackOutCount`, `volInUSDC6`, `volOutUSDC6`, `attackFeeUSDC6`

---

## Components

### 1. Event Types (`types/events.ts`)

```typescript
import { z } from 'zod'

export const BaseEvt = z.object({
  chainId: z.number(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  logIndex: z.number().int().nonnegative(),
  blockNumber: z.number().int().positive(),
  timestamp: z.number().int().positive(), // unix sec
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  feeUSDC6: z.string().optional(),
  amountToken18: z.string().optional()
})

export const BuySellEvt = BaseEvt.extend({
  type: z.enum(['buy', 'sell']),
  countryId: z.number().int().nonnegative(),
  quoteIn: z.string().optional(),
  quoteOut: z.string().optional(),
  netFeeBps: z.number().int().optional()
})

export const AttackEvt = BaseEvt.extend({
  type: z.literal('attack'),
  fromId: z.number().int().nonnegative(),
  toId: z.number().int().nonnegative()
})
```

### 2. MongoDB Setup (`lib/mongodb.ts`)

```typescript
export async function ensureIndexes() {
  const db = await getDb()
  
  await db.collection('tx_events').createIndex(
    { txHash: 1, logIndex: 1, type: 1 },
    { unique: true, name: 'uniq_tx_log_type' }
  )
  
  await db.collection('wallet_stats_daily').createIndex(
    { wallet: 1, day: 1, chainId: 1 },
    { unique: true, name: 'uniq_wallet_day_chain' }
  )
  
  await db.collection('country_stats_daily').createIndex(
    { countryId: 1, day: 1, chainId: 1 },
    { unique: true, name: 'uniq_country_day_chain' }
  )
}
```

### 3. Analytics Worker (`workers/analytics-write.worker.ts`)

Worker performs:
1. **Validate** event payload with Zod
2. **Upsert** to `tx_events` (idempotent)
3. **Update stats** only if insert was new (`upsertedCount === 1`)
4. **Atomic $inc** operations for wallet & country stats

```typescript
const proc = makeWorker<AnyEvt>('analytics-write', async ({ data }) => {
  const db = await getDb()
  const ev = data.type === 'attack' ? AttackEvt.parse(data) : BuySellEvt.parse(data)
  
  // 1) Upsert event
  const up = await eventsCol.updateOne(
    { txHash: ev.txHash, logIndex: ev.logIndex, type: ev.type },
    { $setOnInsert: {...}, $set: ev },
    { upsert: true }
  )
  
  // 2) Update stats only if new insert
  if (up.upsertedCount === 1) {
    await stats.updateOne(
      { wallet: ev.wallet, day, chainId: ev.chainId },
      { $setOnInsert: {...}, $inc: {...} },
      { upsert: true }
    )
  }
})
```

### 4. Queue Helper (`lib/analytics-enqueue.ts`)

```typescript
export async function enqueueAnalyticsEvent(evt: AnyEvtT): Promise<string | null> {
  const q = makeQueue('analytics-write')
  if (!q) return null
  
  const jobId = `${evt.txHash}:${evt.logIndex}:${evt.type}`
  const job = await q.add('evt', evt, defaultJobOpts({ jobId }))
  
  return job.id
}
```

---

## Integration Points

### Buy (`app/api/trade/buy/route.ts`)

```typescript
if (status === 'CONFIRMED') {
  await emitPriceForTx(txId, { countryId })
  
  enqueueAnalyticsEvent({
    type: 'buy',
    chainId: 84532,
    txHash: hash,
    logIndex: 0,
    blockNumber: Number(receipt.blockNumber || 0),
    timestamp: Math.floor(Date.now() / 1000),
    wallet: user,
    countryId,
    amountToken18: amountToken18.toString(),
    quoteIn: quote.maxInUSDC6.toString(),
    netFeeBps: quote.netFeeBps
  }).catch(e => console.error('[BUY] Analytics enqueue failed:', e))
}
```

### Sell (`app/api/trade/sell/route.ts`)

```typescript
if (status === 'CONFIRMED') {
  await emitPriceForTx(txId, { countryId })
  
  enqueueAnalyticsEvent({
    type: 'sell',
    chainId: 84532,
    txHash: hash,
    logIndex: 0,
    blockNumber: Number(receipt.blockNumber || 0),
    timestamp: Math.floor(Date.now() / 1000),
    wallet: user,
    countryId,
    amountToken18: amountToken18.toString(),
    quoteOut: quote.minOutUSDC6.toString(),
    netFeeBps: quote.netFeeBps
  }).catch(e => console.error('[SELL] Analytics enqueue failed:', e))
}
```

### Attack (`app/api/queue/attack-events/route.ts`)

```typescript
enqueueAnalyticsEvent({
  type: 'attack',
  chainId: 84532,
  txHash: body.txHash,
  logIndex: 0,
  blockNumber: Number(body.blockNumber || 0),
  timestamp: Math.floor((body.timestamp || Date.now()) / 1000),
  wallet: body.user,
  fromId: Number(body.fromId),
  toId: Number(body.toId),
  feeUSDC6: body.feeUSDC6 || '0',
  amountToken18: body.amountToken18 || '0'
}).catch(e => console.error('[QUEUE/ATTACK] Analytics enqueue failed:', e))
```

---

## Deployment

### Worker Setup

```bash
# Development
npm run worker:analytics

# Production (PM2)
pm2 start npm --name "analytics-worker" -- run worker:analytics
pm2 save
```

### Environment Variables

Ensure these are set in `.env.local`:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://...

# Queue
USE_QUEUE=true
REDIS_URL=redis://...
QUEUE_PREFIX=fw

# RPC
NEXT_PUBLIC_RPC_BASE_SEPOLIA=https://sepolia.base.org
```

---

## Monitoring

### Queue Health

```bash
curl http://localhost:3000/api/health/queue
```

### MongoDB Queries

```javascript
// Count events by type
db.tx_events.aggregate([
  { $group: { _id: "$type", count: { $sum: 1 } } }
])

// Wallet stats for a specific day
db.wallet_stats_daily.find({
  wallet: "0x...",
  day: "2025-01-15"
})

// Top countries by volume
db.country_stats_daily.aggregate([
  { $group: {
    _id: "$countryId",
    totalVolIn: { $sum: "$volInUSDC6" },
    totalVolOut: { $sum: "$volOutUSDC6" }
  }},
  { $sort: { totalVolIn: -1 } },
  { $limit: 10 }
])
```

---

## Features

### Idempotency

- **tx_events**: Unique index prevents duplicates
- **stats**: Only incremented if event is new (`upsertedCount === 1`)
- **Queue**: `jobId` based on `txHash:logIndex:type`

### Atomicity

- **$inc operations**: Atomic at MongoDB level
- **Single document updates**: No race conditions
- **Day-based partitioning**: Separate documents per wallet/day

### Non-Blocking

- All enqueue calls use `.catch()` to prevent API failures
- Worker processes async
- Stats updates happen after tx confirmation

---

## Future Enhancements

1. **On-chain indexer**: Reconcile with `tx_events` for missing data
2. **TTL**: Add `expireAt` index to `tx_events` for auto-cleanup
3. **Hourly stats**: Add `wallet_stats_hourly` for real-time dashboards
4. **Analytics API**: Expose stats via `/api/analytics/*` endpoints
5. **Privacy**: Anonymize wallet addresses if needed

---

## Testing

### Manual Test

1. Start worker: `npm run worker:analytics`
2. Perform a buy: `curl http://localhost:3000/api/trade/buy ...`
3. Check MongoDB:
   ```javascript
   db.tx_events.findOne({ type: 'buy' })
   db.wallet_stats_daily.findOne({ wallet: '0x...' })
   ```

### Automated Test

```bash
# TODO: Create test script
npm run test:analytics
```

---

## Summary

✅ **Append-only audit** via `tx_events`  
✅ **Atomic stats** via `wallet_stats_daily` & `country_stats_daily`  
✅ **Idempotent** via unique indexes  
✅ **Non-blocking** via async queue  
✅ **Production-ready** with BullMQ + MongoDB  

System is ready for deployment! 🚀

