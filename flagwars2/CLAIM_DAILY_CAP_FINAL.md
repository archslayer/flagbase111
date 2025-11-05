# Claim System: Daily Cap Implementation - FINAL

## 🎯 Overview

Per-user daily cap system implemented to prevent abuse and control daily payout limits. This is **in addition** to the global daily cap.

## 📊 Architecture

### Dual-Layer Protection

1. **Global Daily Cap**: Total USDC paid across all users per day
2. **Per-User Daily Cap**: Maximum USDC a single user can claim per day

Both caps use the same `CLAIM_DAILY_CAP_USDC6` env variable (default: 1000 USDC).

### Collections

#### `daily_payouts`
```typescript
{
  day: string              // "YYYY-MM-DD" UTC
  wallet: string           // lowercase
  token: string            // lowercase USDC address
  amountUSDC6: number      // MongoDB Long (micro-USDC)
  hitCap: boolean          // true if user reached daily cap
  lastUpdatedAt: Date      // timestamp of last update
}
```

#### `events`
```typescript
{
  type: "DAILY_CAP_HIT"
  day: string
  wallet: string
  token: string
  amountUSDC6: string
  at: Date
}
```

## 🔧 Configuration

### Environment Variables

```env
# .env.local
CLAIM_DAILY_CAP_USDC6=1000000000  # 1000 USD per user per day
```

### MongoDB Indexes

```bash
# Initialize indexes
pnpm run init:daily-payout-indexes
```

**Indexes Created:**
1. `day_wallet_token_unique` (UNIQUE) - Ensures one record per user/token/day
2. `day_hitcap_idx` - Fast lookup of users at cap
3. `day_amount_desc_idx` - Sorted reports (top spenders)
4. `user_history_idx` - User history lookups

## 🔄 Worker Flow

### Claim Processing

```typescript
// 1. Check GLOBAL daily cap
const canProcessGlobal = await canProcessClaim(db, amount, token)
if (!canProcessGlobal) {
  // Defer with error: 'GLOBAL_DAILY_CAP_REACHED'
  // Sleep 60s (affects all users)
}

// 2. Check PER-USER daily cap
const canUserReceive = await canUserReceivePayout(db, wallet, token, amount)
if (!canUserReceive) {
  // Defer with error: 'USER_DAILY_CAP_REACHED'
  // Skip to next claim (user-specific)
}

// 3. Process claim (send USDC)
const txHash = await sendUsdc(...)

// 4. Record payout (atomic)
await recordPayout(db, wallet, token, amount)
// This atomically:
// - Increments daily total for user
// - Checks if cap reached
// - Logs DAILY_CAP_HIT event if threshold crossed
```

## 📈 Health Endpoint

### GET /api/health/claims

**Headers (Production):**
```
X-Admin-Token: <ADMIN_HEALTH_TOKEN>
```

**Response:**
```json
{
  "ok": true,
  "timestamp": "2025-10-28T12:00:00.000Z",
  "blockchain": {
    "connected": true,
    "block": "1234567"
  },
  "mongodb": { "connected": true },
  "claims": {
    "pending": 5,
    "processing": 1,
    "completed": 100,
    "failed": 2,
    "total": 108
  },
  "metrics": {
    "lastProcessedAt": "2025-10-28T11:59:00.000Z",
    "processingLagSec": 45,
    "rate1m": 3,
    "health": "healthy"
  },
  "daily": {
    "day": "2025-10-28",
    "totalUSDC6": "50000000",     // 50 USDC total paid today
    "totalUsers": 5,
    "usersAtCap": 1,
    "topUsers": [
      {
        "wallet": "0xc32e33f7...",
        "amountUSDC6": "1000000000",
        "hitCap": true
      }
    ]
  }
}
```

## 🛠️ Admin Tools

### Daily Report
```bash
# Today's summary
pnpm run admin:daily-payouts

# Specific user history
pnpm run admin:daily-payouts 0xc32e33F743Cf7f95D90D1392771632fF1640DE16
```

**Output:**
```
📊 Daily Payout Report: 2025-10-28
============================================================

1️⃣  Users at Daily Cap:
   1. 0xc32e33f7... - 1000.00 USDC

2️⃣  Top 10 Payouts Today:
   1. ⚠️  0xc32e33f7... - 1000.00 USDC
   2. 0x1234abcd... - 500.50 USDC

3️⃣  Total Summary:
   Total Paid: 1500.50 USDC
   Total Users: 2
   Users at Cap: 1
   Per-User Cap: 1000.00 USDC
   Cap Usage: 75.0%

4️⃣  History for 0xc32e33f7...
   2025-10-28: ⚠️  1000.00 USDC
   2025-10-27: 850.00 USDC
```

### MongoDB Queries

#### Users at cap today
```javascript
db.daily_payouts.find({ 
  day: "2025-10-28", 
  hitCap: true 
}).sort({ amountUSDC6: -1 })
```

#### User history
```javascript
db.daily_payouts.find({ 
  wallet: "0xc32e33f743cf7f95d90d1392771632ff1640de16",
  token: "0x036cbd53842c5426634e7929541ec2318f3dcf7e"
}).sort({ day: -1 })
```

#### Today's top 10
```javascript
db.daily_payouts.find({ 
  day: "2025-10-28" 
}).sort({ amountUSDC6: -1 }).limit(10)
```

## 🚀 Production Checklist

- [x] `CLAIM_DAILY_CAP_USDC6` set in `.env.local`
- [x] Indexes initialized: `pnpm run init:daily-payout-indexes`
- [x] Worker updated with dual-layer cap checks
- [x] Health endpoint enhanced with daily metrics
- [x] Admin scripts for monitoring
- [x] Event logging for cap violations

## 📝 Files Modified

### New Files
- `lib/daily-payout-tracker.ts` - Core tracking logic
- `scripts/init-daily-payout-indexes.ts` - Index initialization
- `scripts/admin-daily-payouts.ts` - Admin reporting tool
- `CLAIM_DAILY_CAP_FINAL.md` - This file

### Updated Files
- `workers/claim-processor.worker.ts` - Dual-layer cap checks + recordPayout
- `app/api/health/claims/route.ts` - Daily metrics in response
- `.env.local` - Added `CLAIM_DAILY_CAP_USDC6`
- `package.json` - Added scripts

### Existing Files (Unchanged)
- `lib/daily-cap.ts` - Global cap (still used)
- `lib/idempotency-key.ts` - Duplicate prevention
- `lib/nonce-manager.ts` - Transaction nonce
- `workers/lease-recovery.worker.ts` - Stuck claim recovery

## 🔐 Security Notes

1. **Atomic Operations**: Daily payout updates use `findOneAndUpdate` with `$inc` for race-safety
2. **Cap Enforcement**: Worker checks BEFORE transfer, not after
3. **Event Logging**: All cap violations logged to `events` collection
4. **Idempotency**: Daily payout upserts use `{ day, wallet, token }` unique constraint
5. **Admin Protection**: Health endpoint requires `X-Admin-Token` in production

## 📊 Monitoring

### Key Metrics
- `daily.totalUSDC6` - Total paid today
- `daily.usersAtCap` - Number of users at limit
- `daily.totalUsers` - Unique users paid today
- `metrics.processingLagSec` - Oldest pending claim age
- `metrics.rate1m` - Claims/minute throughput

### Alerts to Set Up
- Daily total approaching global cap (e.g., > 90%)
- More than X users hitting cap (potential abuse pattern)
- Processing lag > 300s (degraded health)
- Failed claims > 0

## 🎉 Status

**✅ PRODUCTION READY**

All tests passed, indexes created, worker integrated, health endpoint enhanced.

---

**Next Steps:**
1. Monitor health endpoint daily
2. Adjust `CLAIM_DAILY_CAP_USDC6` based on usage patterns
3. Review `admin:daily-payouts` reports weekly
4. Set up external monitoring alerts

