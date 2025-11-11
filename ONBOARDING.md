# User Onboarding System

Production-ready user onboarding system with Redis Streams, rate limiting, automatic recovery, and comprehensive observability.

## Overview

The onboarding system handles new user registration seamlessly:
- **High concurrency safe**: Handles 1000+ simultaneous onboarding requests
- **Idempotent**: Safe to retry, no duplicate users
- **Fault tolerant**: Automatic recovery from failures
- **Observable**: Comprehensive metrics and structured logging

## Architecture

### Components

1. **API Endpoints**
   - `POST /api/user/onboard` - Queue user for onboarding
   - `GET /api/user/status` - Check onboarding status

2. **Workers**
   - `workers/user-onboarder.ts` - Main worker that processes queue
   - `workers/reclaimer.ts` - Reclaims stuck messages

3. **UI**
   - `app/creating/page.tsx` - Onboarding status page

### Flow

```
1. User logs in → POST /api/user/onboard
2. System acquires lock (30s) → Prevents duplicates
3. Adds to Redis Stream → user:onboard:queue
4. Worker picks up message → Processes in order
5. Creates user in MongoDB → users collection
6. Updates status → Redis cache (10-15 min TTL)
7. UI polls status → GET /api/user/status
8. Redirects to app → When completed
```

## Redis Structure

### Streams
- `user:onboard:queue` - Main onboarding queue (MAXLEN ~1M)
- `user:onboard:dlq` - Dead letter queue (failed after 3 retries)

### Keys
- `user:onboard:lock:<wallet>` - Idempotency lock (30s TTL)
- `user:onboard:status:<wallet>` - Status cache (JSON, 10-15min TTL)
- `onboard:ip:<ip>` - Rate limit counter (60s TTL)
- `onboard:user:<wallet>` - Rate limit counter (60s TTL)

### Consumer Groups
- `user-onboarders` - Main consumer group
- Workers: `worker-<pid>`
- Reclaimer: `reclaimer-<pid>`

## Features

### Rate Limiting
- **IP**: 10 requests/minute
- **User**: 3 requests/minute
- Prevents abuse and spam

### Idempotency
- Per-wallet lock (30s)
- Unique MongoDB index on `userId`
- Safe to retry at any stage

### Automatic Recovery
- **Reclaimer**: Runs every 20s, claims messages idle >30s
- **Retry logic**: Up to 3 attempts with exponential backoff
- **DLQ**: Failed messages after 3 retries

### Stream Management
- **Trim**: Automatic trim to max 1M entries (~)
- **Backlog**: Consumer group starts at '$' (new messages only)

### Observability

#### Metrics
- `queue_depth` - Stream length
- `pending_count` - XPENDING count
- `reclaimed_total` - Reclaimed messages
- `latency_ms` - Average processing time
- `fail_total` - Failed onboarding attempts
- `dlq_total` - DLQ size

#### Structured Logs
```json
{
  "event": "onboard_completed",
  "wallet": "0x...",
  "requestId": "uuid",
  "messageId": "stream-id",
  "latencyMs": 1234,
  "timestamp": 1234567890
}
```

## Running the System

### 1. Start Main Worker
```bash
npx tsx workers/user-onboarder.ts
```

### 2. Start Reclaimer (optional but recommended)
```bash
npx tsx workers/reclaimer.ts
```

### 3. Initialize Database Indexes
```bash
npx tsx scripts/init-users-indexes.ts
```

## Configuration

### Environment Variables
```env
USE_REDIS=true
REDIS_HOST=...
REDIS_PORT=...
REDIS_USERNAME=...
REDIS_PASSWORD=...
MONGODB_URI=...
```

### Constants
- `MAX_ONBOARD_PER_MINUTE_PER_IP = 10`
- `MAX_ONBOARD_PER_MINUTE_PER_USER = 3`
- `PENDING_THRESHOLD_MS = 30_000` (30s)
- `MAX_RETRIES = 3`
- `LOCK_TTL = 30` (seconds)
- `STATUS_TTL = 600-900` (10-15 minutes)

## API Reference

### POST /api/user/onboard

Queues user for onboarding (idempotent).

**Auth**: Required (JWT)

**Response**:
```json
{
  "ok": true,
  "state": "pending",
  "redirect": "/creating"
}
```

**Status Codes**:
- `200` - Success (pending or processing)
- `401` - Unauthorized
- `429` - Rate limit exceeded
- `503` - Redis unavailable

### GET /api/user/status

Checks onboarding status.

**Auth**: Required (JWT)

**Response**:
```json
{
  "ok": true,
  "state": "pending|processing|completed|failed",
  "enqueuedAt": 1234567890
}
```

**Fallback**: If status not in Redis, checks MongoDB and caches result.

## State Machine

```
pending → processing → completed
              ↓
           failed
```

- **pending**: In queue, waiting for worker
- **processing**: Worker is creating user
- **completed**: User created successfully
- **failed**: Retries exhausted, moved to DLQ

## Monitoring

### Health Checks
- Worker logs: `[ONBOARDER] ✅ Completed`
- Reclaimer logs: `[RECLAIMER] ✅ Reclaimed`
- Metrics: Every 20s in reclaimer

### Alerts
Monitor for:
- Queue depth > 10k
- Pending count increasing over time
- DLQ size > 100
- Avg latency > 30s

## Troubleshooting

### Messages Stuck in Pending
**Solution**: Check reclaimer is running, increase `PENDING_THRESHOLD_MS`

### Users Created Multiple Times
**Solution**: Check unique index exists on `users.userId`

### Redis Connection Timeouts
**Solution**: Verify `REDIS_HOST`, `REDIS_PORT`, credentials

### Worker Not Processing
**Solution**: Check consumer group exists, restart worker

## Testing

### Manual Test
1. Login with new wallet
2. Should redirect to `/creating`
3. Should show "Creating Your Account..."
4. Should redirect to target URL after completion

### Load Test
```bash
# Simulate 100 concurrent onboardings
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/user/onboard \
    -H "Cookie: auth_token=..." &
done
```

## Security

- ✅ JWT authentication required
- ✅ Rate limiting (IP + user)
- ✅ Address checksumming (getAddress)
- ✅ Lock-based idempotency
- ✅ Nonce-based signature verification
- ✅ Structured error handling

## Future Enhancements

- [ ] SSE for real-time status updates
- [ ] Admin dashboard for queue monitoring
- [ ] Custom retry strategies per error type
- [ ] Integration with APM (DataDog, New Relic)
- [ ] Prometheus metrics export

