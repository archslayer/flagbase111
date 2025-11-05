# Market Recent Activity - Attack Feed Implementation

## 🎯 Overview

Implemented a **real-time attack activity feed** on the Market page showing the last 10 attacks with efficient 2-second polling and ETag-based caching.

---

## ✅ What Was Implemented

### 1. **Backend Infrastructure**

#### Redis Schema

**List: `attack:recent`**
- Stores last 1000 attack events
- LPUSH for new events (newest first)
- LTRIM to maintain size limit

**Deduplication: `attack:dedup:{attackId}`**
- SET NX with 24-hour TTL
- Prevents duplicate events for same attack
- Key format: `attack:dedup:${txHash}:${logIndex}`

#### Producer Helper (`lib/activity/attacks.ts`)

```typescript
interface AttackEvent {
  attackId: string          // txHash:logIndex
  ts: number               // Unix timestamp
  blockNumber: number
  logIndex: number
  attacker: string         // lowercase
  attackerCountry: string  // e.g., "TR"
  defenderCode: string     // e.g., "US"
  delta: string            // Delta points
  feeUSDC6: string         // Fee in micro-USDC
  txHash: string
}

async function pushAttackEvent(event: AttackEvent)
```

**Features:**
- Atomic dedup + push + trim using Redis pipeline
- Silent duplicate handling (logs only)
- Non-critical error handling (doesn't throw)

---

### 2. **API Endpoints**

#### `POST /api/activity/push-attack`

**Purpose:** Receive attack events from frontend after successful transactions

**Features:**
- Zod schema validation
- Calls `pushAttackEvent` to write to Redis
- Non-blocking (fire-and-forget from frontend)

**Request Body:**
```json
{
  "attackId": "0xabc...:0",
  "ts": 1698765432,
  "blockNumber": 12345678,
  "logIndex": 0,
  "attacker": "0x...",
  "attackerCountry": "TR",
  "defenderCode": "US",
  "delta": "2.50",
  "feeUSDC6": "350000",
  "txHash": "0xabc..."
}
```

#### `GET /api/activity/attacks`

**Purpose:** Fetch recent attacks with ETag support for efficient polling

**Features:**
- Returns last 10 attacks from Redis
- Generates ETag based on first + last + count
- Returns 304 Not Modified if ETag matches
- IP-based rate limiting (30 req/min)

**Response (200):**
```json
{
  "ok": true,
  "items": [
    {
      "attackId": "0xabc...:0",
      "ts": 1698765432,
      "attacker": "0x...",
      "attackerCountry": "TR",
      "defenderCode": "US",
      "delta": "2.50",
      "feeUSDC6": "350000",
      "txHash": "0xabc..."
    }
  ],
  "count": 10
}
```

**Response (304):** Empty body, ETag header unchanged

#### `GET /api/health/activity`

**Purpose:** Monitor Redis connection and activity feed health

**Response:**
```json
{
  "ok": true,
  "redisConnected": true,
  "recentAttacksCount": 42
}
```

---

### 3. **Frontend Component**

#### `components/market/RecentAttacks.tsx`

**Features:**
- 2-second polling interval
- ETag-based conditional requests (304 handling)
- 800ms fetch timeout with automatic abort
- Graceful error handling (keeps previous data)
- Silent failure (shows cached data on errors)
- No re-render if data unchanged

**UI Design:**
- Minimal, clean list
- Flag emojis for countries
- Attack icon (⚔️)
- Shortened wallet addresses (first 4 hex chars)
- Delta points display
- Time ago format (e.g., "30s ago", "5m ago")
- Gray text for metadata

**Example Row:**
```
🇹🇷 abc1.. ⚔️ 🇺🇸    Δ 2.50%  30s ago
```

---

### 4. **UI Utilities**

#### `lib/ui/flags.ts`

```typescript
// Convert country code to flag emoji
flagEmoji("TR") // → 🇹🇷

// Attack icon
<AttackIcon /> // → ⚔️

// Shorten wallet address
short4("0xabcd1234...") // → "abcd"

// Format time ago
timeAgo(1698765432) // → "30s ago", "5m ago", "2h ago"
```

**Features:**
- Flag emoji generation from country codes
- Simple React component for attack icon
- Wallet address truncation
- Human-readable time formatting

---

### 5. **Integration Points**

#### Attack Page (`app/attack/page.tsx`)

After successful attack confirmation:

```typescript
if (receipt.status === 'success') {
  // ... existing code ...
  
  // Push attack event to activity feed
  fetch('/api/activity/push-attack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attackId: `${txHash}:0`,
      ts: Math.floor(Date.now() / 1000),
      blockNumber: Number(receipt.blockNumber || 0),
      logIndex: 0,
      attacker: address!.toLowerCase(),
      attackerCountry: attackerFlag.code,
      defenderCode: targetFlag.code,
      delta: attackConfig ? attackConfig.deltaPoints.toFixed(2) : '0',
      feeUSDC6: (fee * BigInt(multiplier)).toString(),
      txHash
    })
  }).catch(() => {}) // Non-critical, don't block UX
}
```

**Note:** Fire-and-forget, non-blocking

#### Market Page (`app/market/page.tsx`)

Replaced static "Recent Activity" section:

```tsx
import RecentAttacks from '@/components/market/RecentAttacks'

// ...

{/* Recent Activity - Dynamic Attack Feed */}
<RecentAttacks />
```

---

## 🔄 System Flow

### 1. User Performs Attack

```
User clicks "ATTACK" button
  ↓
Transaction sent & confirmed
  ↓
Frontend calls POST /api/activity/push-attack
  ↓
Backend validates & pushes to Redis:
  - Check dedup key (SETNX)
  - If new: LPUSH to attack:recent
  - LTRIM to keep last 1000
```

### 2. Market Page Displays Feed

```
Component mounts
  ↓
Fetch GET /api/activity/attacks (no ETag)
  ↓
Receive 200 with items + ETag
  ↓
Display 10 most recent attacks
  ↓
Wait 2 seconds
  ↓
Fetch again with If-None-Match: {ETag}
  ↓
If unchanged: 304 (no re-render)
If changed: 200 with new data (update + re-render)
```

---

## 📊 Performance Characteristics

### Backend

**Redis Operations:**
- `SETNX` (dedup): O(1)
- `LPUSH` (add to list): O(1)
- `LTRIM` (maintain size): O(N) where N = items to remove (typically 1)
- `LRANGE` (read): O(N) where N = 10 (constant)

**Total per-write:** ~O(1) amortized

**Total per-read:** O(10) = constant

**No database queries** - 100% Redis

### Frontend

**Network:**
- 1 request every 2 seconds
- Most requests: 304 (no body, ~200 bytes)
- Changed data: 200 (~2-3 KB)

**Memory:**
- Stores max 10 items in state (~1 KB)
- AbortController for request cancellation
- No memory leaks

**CPU:**
- Minimal JSON parsing
- No heavy calculations
- React re-renders only on data change

---

## 🧪 Testing

### Manual Tests

1. **Deduplication Test**
   ```bash
   # Send same attack event twice
   curl -X POST /api/activity/push-attack -d '{"attackId":"0xtest:0",...}'
   curl -X POST /api/activity/push-attack -d '{"attackId":"0xtest:0",...}'
   
   # Expected: Only 1 event in feed
   curl /api/activity/attacks
   ```

2. **ETag Test**
   ```bash
   # First request
   curl -i /api/activity/attacks
   # Note ETag header
   
   # Second request with ETag
   curl -i -H "If-None-Match: W/\"abc123\"" /api/activity/attacks
   # Expected: 304 if no new attacks
   ```

3. **Polling Test**
   - Open Market page
   - Open browser DevTools → Network tab
   - Watch requests every 2 seconds
   - Perform an attack
   - Verify new event appears within 2 seconds

4. **Rate Limit Test**
   ```bash
   # Spam requests
   for i in {1..35}; do
     curl /api/activity/attacks &
   done
   
   # Expected: Last 5 requests return 429
   ```

### Health Check

```bash
curl /api/health/activity
```

**Expected:**
```json
{
  "ok": true,
  "redisConnected": true,
  "recentAttacksCount": 42
}
```

---

## 🔍 Monitoring

### Redis Keys to Monitor

```bash
# Check recent attacks count
redis-cli LLEN attack:recent

# View last 10 attacks
redis-cli LRANGE attack:recent 0 9

# Check dedup keys (should auto-expire in 24h)
redis-cli KEYS "attack:dedup:*" | head -10
```

### API Metrics

**Key metrics to track:**
- `/api/activity/attacks` request rate
- 304 vs 200 response ratio (should be high)
- `/api/activity/push-attack` success rate
- Redis connection errors

---

## 🚀 Future Enhancements (Optional)

### 1. **SSE (Server-Sent Events) Instead of Polling**

Replace 2s polling with push-based SSE:

```typescript
// Backend: app/api/activity/attacks/stream/route.ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Subscribe to Redis pub/sub
      // Push new attacks to client
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

**Benefits:**
- Real-time updates (no 2s delay)
- Reduced network traffic
- Lower server load

### 2. **Extended Event Data**

Add more fields:
- Attacker wallet display name
- Defender wallet (if different from country owner)
- Price impact
- Net points change

### 3. **Filters**

Allow users to filter by:
- Specific country
- Date range
- Minimum delta

---

## ✅ Acceptance Criteria (All Met)

- [x] Producer writes to Redis with deduplication
- [x] Only 1 record per unique `attackId`
- [x] GET /api/activity/attacks returns last 10 events
- [x] ETag support (304 responses when unchanged)
- [x] UI polls every 2 seconds
- [x] No re-render when data unchanged (ETag match)
- [x] List sorted by time (newest first)
- [x] No flickering/jumping on re-render
- [x] No database queries (Redis only)
- [x] Existing system unchanged (buy/sell/attack still work)

---

## 📁 Files Created/Modified

### New Files

- `lib/activity/attacks.ts` - Redis producer & helper functions
- `app/api/activity/attacks/route.ts` - Read endpoint with ETag
- `app/api/activity/push-attack/route.ts` - Write endpoint
- `app/api/health/activity/route.ts` - Health check
- `lib/ui/flags.ts` - UI utilities (flags, icons, formatting)
- `components/market/RecentAttacks.tsx` - Frontend component
- `MARKET_RECENT_ACTIVITY_IMPLEMENTATION.md` - This doc

### Modified Files

- `app/attack/page.tsx` - Added activity feed integration
- `app/market/page.tsx` - Integrated RecentAttacks component

---

## 🎯 Summary

**What Works:**
- ✅ Real-time attack feed with 2s latency
- ✅ Efficient polling with ETag (304 responses)
- ✅ Deduplication (no duplicate events)
- ✅ Fast (100% Redis, no DB queries)
- ✅ Non-blocking (fire-and-forget from frontend)
- ✅ Graceful degradation (cached data on errors)
- ✅ Minimal UI (clean, simple, fast)

**Performance:**
- Backend: O(1) writes, O(10) reads
- Frontend: ~0.2 KB per request (mostly 304s)
- No database load
- No memory leaks

**System is production-ready!** 🚀

