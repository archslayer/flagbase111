# Claim Worker - Setup & Documentation

## Overview

Off-chain claim worker that processes pending USDC claims from MongoDB and transfers them on-chain.

**Features:**
- ✅ Idempotent processing with status leasing
- ✅ Exponential backoff for retries
- ✅ Graceful shutdown
- ✅ Production-ready security
- ✅ Comprehensive health checks

---

## Environment Variables

Add these to your `.env.local` file:

```bash
# === Claim Worker Configuration ===

# RPC and Chain
BASE_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY  # or Base mainnet
CHAIN_ID=84532  # 84532 = Base Sepolia, 8453 = Base Mainnet

# USDC Token Address
CLAIM_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e  # Base Sepolia
# CLAIM_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  # Base Mainnet

# Treasury Wallet (Private Key)
CLAIM_TREASURY_PK=0x...  # Private key of wallet holding USDC for payouts
# ⚠️ PRODUCTION: Use dedicated treasury wallet with multi-sig

# Worker Settings
CLAIM_MIN_CONFIRMATIONS=2           # Wait for N confirmations
CLAIM_BATCH_LIMIT=25                # Max claims to process per batch
CLAIM_MAX_ATTEMPTS=5                # Max retry attempts before marking failed
CLAIM_QUEUE_CONCURRENCY=5           # Parallel processing limit

# Security
ADMIN_HEALTH_TOKEN=your-secret-token-here  # For /api/health/claims endpoint
```

---

## Installation

### 1. Initialize MongoDB Indexes

```bash
pnpm run init:claim-indexes
```

**Output:**
```
✅ Connected to MongoDB
📊 Creating indexes for offchain_claims...
  ✅ worker_query_idx (status + claimedAt)
  ✅ user_lookup_idx (wallet + status)
  ✅ tx_hash_idx (txHash, sparse)
  ✅ wallet_idx (wallet)
✅ All indexes created successfully!
```

### 2. Verify Configuration

```bash
# Check treasury wallet has USDC
npx tsx -e "
import { publicClient } from './lib/viem/clients.js'
const balance = await publicClient.readContract({
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  abi: [{inputs:[{name:'account',type:'address'}],name:'balanceOf',outputs:[{type:'uint256'}],stateMutability:'view',type:'function'}],
  functionName: 'balanceOf',
  args: ['YOUR_TREASURY_ADDRESS']
})
console.log('Treasury USDC:', (balance / 1000000n).toString())
"
```

---

## Running the Worker

### Development
```bash
pnpm run worker:claims
```

### Production (PM2)
```bash
# Install PM2
npm install -g pm2

# Start worker
pm2 start "pnpm run worker:claims" --name "claim-worker"

# View logs
pm2 logs claim-worker

# Monitor
pm2 monit

# Stop
pm2 stop claim-worker

# Restart
pm2 restart claim-worker
```

### Production (Systemd)
```bash
# Create service file: /etc/systemd/system/claim-worker.service
[Unit]
Description=FlagWars Claim Processor Worker
After=network.target

[Service]
Type=simple
User=flagwars
WorkingDirectory=/opt/flagwars
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pnpm run worker:claims
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable claim-worker
sudo systemctl start claim-worker

# Check status
sudo systemctl status claim-worker

# View logs
sudo journalctl -u claim-worker -f
```

---

## Health Check

### Endpoint
```
GET /api/health/claims
```

### Development
```bash
curl http://localhost:3000/api/health/claims
```

### Production (requires token)
```bash
curl -H "X-Admin-Token: your-secret-token-here" \
  https://your-domain.com/api/health/claims
```

### Response
```json
{
  "ok": true,
  "timestamp": "2025-10-28T18:00:00.000Z",
  "blockchain": {
    "connected": true,
    "block": "12345678"
  },
  "mongodb": {
    "connected": true
  },
  "claims": {
    "pending": 5,
    "processing": 1,
    "completed": 42,
    "failed": 0,
    "total": 48
  }
}
```

---

## Testing

### 1. Create Test Claim
```bash
npx tsx scripts/add-test-referral-claim.ts
```

### 2. Check Claim Status
```bash
npx tsx scripts/check-claims.ts
```

**Before Processing:**
```
Claim 1:
  Amount: 0.10 USDC
  Status: pending
  Reason: test_claim
```

### 3. Start Worker
```bash
pnpm run worker:claims
```

**Worker Output:**
```
[Claim Worker] Warming up...
[Claim Worker] ✅ MongoDB connected
[Claim Worker] ✅ Blockchain connected (block: 12345678)
[Claim Worker] ✅ Treasury balance: 1000 USDC
[Claim Worker] Warmup complete!
[Claim Worker] Starting process loop...
[Claim Worker] Processing claim 672...
  Wallet: 0xc32e...de16
  Amount: 0.10 USDC
[Claim Worker] ✅ Completed: 0x1234abcd...
```

### 4. Verify On-Chain
```bash
npx tsx scripts/check-claims.ts
```

**After Processing:**
```
Claim 1:
  Amount: 0.10 USDC
  Status: completed
  TX: 0x1234abcd...
  Processed: 2025-10-28T18:00:30Z
```

---

## Architecture

### Flow Diagram
```
User Clicks "Claim"
     ↓
API: /api/referral/claim
     ↓
MongoDB: Insert { status: 'pending' }
     ↓
[Worker Loop]
     ↓
Lease Claim (status → 'processing')
     ↓
Check Treasury Balance
     ↓
Send USDC Transfer (viem)
     ↓
Wait for Confirmations
     ↓
Update { status: 'completed', txHash }
```

### Idempotency
```
findOneAndUpdate(
  { status: 'pending' },     ← Only lease available claims
  { 
    $set: { status: 'processing' },  ← Atomic lease
    $inc: { attempts: 1 }            ← Track retries
  },
  { sort: { claimedAt: 1 } }  ← FIFO processing
)
```

### Error Handling
```
Try:
  - Send USDC
  - Update to 'completed'
Catch:
  - attempts < MAX → status='pending' (retry)
  - attempts >= MAX → status='failed' (permanent)
  - Log error message
```

---

## MongoDB Schema

### Collection: `offchain_claims`

```typescript
{
  _id: ObjectId,
  wallet: string,           // lowercase, e.g. "0xc32e..."
  amount: string,           // micro-USDC (6 decimals), e.g. "100000" = 0.10 USDC
  token: string,            // USDC address
  status: 'pending' | 'processing' | 'completed' | 'failed',
  reason: string,           // e.g. "test_claim", "milestone_10"
  attempts: number,         // retry count
  claimedAt: Date,          // when claim was requested
  processedAt?: Date,       // when transfer completed
  txHash?: string,          // on-chain transaction hash
  error?: string            // error message if failed
}
```

### Indexes
- `{ status: 1, claimedAt: 1 }` - Worker queries
- `{ wallet: 1, status: 1 }` - User lookups
- `{ txHash: 1 }` (sparse) - Transaction tracking
- `{ wallet: 1 }` - getTotalClaimable queries

---

## Security Considerations

### Treasury Wallet
- ⚠️ **Never** commit private key to git
- ✅ Use `.env.local` (gitignored)
- ✅ Production: Dedicated wallet with multi-sig
- ✅ Monitor balance regularly
- ✅ Set up alerts for low balance

### Health Endpoint
- ⚠️ Production requires `X-Admin-Token` header
- ✅ Returns `403 Unauthorized` without token
- ✅ `Cache-Control: no-store` to prevent caching
- ✅ No PII in logs or responses

### Rate Limiting
- Worker processes claims sequentially (500ms delay)
- `CLAIM_BATCH_LIMIT` prevents runaway processing
- `CLAIM_MAX_ATTEMPTS` prevents infinite retries
- Exponential backoff (5s) on errors

---

## Monitoring

### Key Metrics
- **Pending claims** - Should stay low
- **Processing claims** - Should be 0 or 1 (worker active)
- **Failed claims** - Should be 0 (investigate failures)
- **Completed claims** - Growing number
- **Treasury balance** - Should not run low

### Alerts
```bash
# Check for failed claims
curl -H "X-Admin-Token: $TOKEN" https://api.example.com/api/health/claims \
  | jq '.claims.failed'

# If > 0, investigate:
db.offchain_claims.find({ status: 'failed' })
```

### Logs
```bash
# PM2
pm2 logs claim-worker --lines 100

# Systemd
sudo journalctl -u claim-worker -n 100 -f

# Look for:
# ✅ "Completed" - successful transfers
# ❌ "Error processing claim" - failures
# ⚠️  "Treasury balance insufficient" - critical
```

---

## Troubleshooting

### Worker Not Processing Claims

**Check 1: Worker Running?**
```bash
pm2 status claim-worker
# or
systemctl status claim-worker
```

**Check 2: MongoDB Connection?**
```bash
curl http://localhost:3000/api/health/claims | jq '.mongodb'
```

**Check 3: Blockchain Connection?**
```bash
curl http://localhost:3000/api/health/claims | jq '.blockchain'
```

**Check 4: Pending Claims Exist?**
```bash
npx tsx scripts/check-claims.ts
```

### Treasury Balance Insufficient

**Check Balance:**
```bash
# Add to scripts/check-treasury-usdc.ts
import { publicClient, getTreasuryAddress } from '../lib/viem/clients'

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const treasury = getTreasuryAddress()

const balance = await publicClient.readContract({
  address: USDC,
  abi: [...],
  functionName: 'balanceOf',
  args: [treasury]
})

console.log('Treasury:', treasury)
console.log('Balance:', (balance / 1000000n).toString(), 'USDC')
```

**Fund Treasury:**
```bash
# Transfer USDC to treasury wallet
# Base Sepolia faucet: https://faucet.circle.com/
```

### Claims Stuck in "Processing"

**Cause:** Worker crashed mid-processing

**Fix:**
```typescript
// Reset to pending (manual)
db.offchain_claims.updateMany(
  { status: 'processing', processedAt: { $exists: false } },
  { $set: { status: 'pending' } }
)
```

### Failed Claims

**Investigate:**
```bash
npx tsx -e "
import { getDb } from './lib/mongodb.js'
const db = await getDb()
const failed = await db.collection('offchain_claims')
  .find({ status: 'failed' })
  .toArray()
failed.forEach(c => {
  console.log('Claim:', c._id)
  console.log('  Wallet:', c.wallet)
  console.log('  Amount:', c.amount)
  console.log('  Error:', c.error)
  console.log('  Attempts:', c.attempts)
  console.log('')
})
"
```

**Common Errors:**
- `Treasury balance insufficient` → Fund treasury
- `Invalid wallet address` → Check wallet format
- `Execution reverted` → USDC contract issue
- `Transaction timeout` → RPC issue

**Retry Failed Claim:**
```typescript
// Reset failed claim to pending (if error is resolved)
db.offchain_claims.updateOne(
  { _id: ObjectId('...') },
  { 
    $set: { status: 'pending', error: null },
    $inc: { attempts: -1 }  // Optional: reset attempts
  }
)
```

---

## Production Checklist

### Pre-Launch
- [ ] `.env.local` configured with production values
- [ ] `CLAIM_TREASURY_PK` using dedicated wallet
- [ ] Treasury wallet funded with USDC
- [ ] MongoDB indexes created (`pnpm run init:claim-indexes`)
- [ ] `ADMIN_HEALTH_TOKEN` set to strong random value
- [ ] Health endpoint tested with token
- [ ] Worker tested with real claim

### Deployment
- [ ] Worker running as systemd service or PM2
- [ ] Worker auto-restarts on failure
- [ ] Logs configured (syslog, CloudWatch, etc.)
- [ ] Monitoring alerts set up (failed claims, low balance)
- [ ] Treasury balance alerts configured

### Post-Launch
- [ ] Health check returns 200
- [ ] Claims processing within 5 minutes
- [ ] No failed claims accumulating
- [ ] Treasury balance monitored daily
- [ ] Worker logs reviewed weekly

---

## Performance Tuning

### High Volume
```bash
# Increase concurrency
CLAIM_QUEUE_CONCURRENCY=10

# Reduce delay between claims
# Edit workers/claim-processor.worker.ts:
await new Promise(resolve => setTimeout(resolve, 100))  # was 500ms
```

### Low Latency
```bash
# Reduce sleep when no claims
# Edit workers/claim-processor.worker.ts:
await new Promise(resolve => setTimeout(resolve, 1000))  # was 3000ms
```

### Cost Optimization
```bash
# Increase confirmations for safety
CLAIM_MIN_CONFIRMATIONS=3

# Reduce unnecessary polling
# Adjust sleep times based on claim frequency
```

---

## FAQ

**Q: Why not on-chain claims?**  
A: Off-chain allows batching, gas optimization, and flexible business logic.

**Q: What if worker crashes mid-transfer?**  
A: Status stays "processing". On restart, it won't re-process (idempotent). Reset manually if needed.

**Q: How to handle refunds?**  
A: Manually set status back to 'pending' and worker will retry.

**Q: Can I run multiple workers?**  
A: No. Idempotent leasing ensures only one worker processes each claim.

**Q: How to test without real USDC?**  
A: Use Base Sepolia testnet and Circle faucet.

---

## Support

For issues:
1. Check logs (`pm2 logs` or `journalctl`)
2. Run health check (`/api/health/claims`)
3. Check MongoDB (`scripts/check-claims.ts`)
4. Verify treasury balance

---

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**Last Updated:** 2025-10-28

