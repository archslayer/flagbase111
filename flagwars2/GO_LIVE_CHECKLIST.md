# Go-Live Checklist — Achievements System

## Pre-Deployment Summary
- ✅ Removed: Consecutive Days category (UI/API/Sync/Scripts)
- ✅ Added: Flag Count (category 5) with thresholds [5, 50, 250, 500]
- ✅ Fixed: Multi-Country thresholds [1, 5, 15, 35] (was 40)
- ✅ Verified: Redis clean, Next build fresh, MongoDB indexes & defs seeded

---

## 1) Environment Check
```bash
# .env.local must have:
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CORE_ADDRESS=0x80Ab8d002649f70Be3BC3654F6f0024626Fedbce
NEXT_PUBLIC_ACHIEVEMENTS_SBT_ADDRESS=0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9
USE_REDIS=true
# Optional: USE_QUEUE=true
```

---

## 2) Clean Start
```bash
# Build/cache
rm -rf .next node_modules/.cache .turbo

# Redis (achievements & inventory)
npx tsx scripts/clear-all-achievement-cache.ts
```

---

## 3) DB Seed & Index
```bash
npx tsx scripts/init-achievements.ts
```

**Expected:**
- Collections: `achv_defs`, `achv_progress`, `achv_mints`, `flags_snapshots`, `attacks`
- Definitions: Categories 1, 2, 3, 5 only
- Thresholds: Multi-Country = [1, 5, 15, 35], Flag Count = [5, 50, 250, 500]

---

## 4) On-Chain Valid Levels
```bash
npx hardhat run scripts/set-valid-levels.js --network baseSepolia
```

**Verify:**
```bash
npx hardhat console --network baseSepolia
const sbt = await ethers.getContractAt('AchievementsSBT', '0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9')
await sbt.validLevels(2, 35) // true
await sbt.validLevels(2, 40) // false
await sbt.validLevels(5, 50) // true
```

---

## 5) Queue Workers (if USE_QUEUE=true)
```bash
pm2 start npm --name fw-attack -- run worker:attack
pm2 start npm --name fw-prewarm -- run worker:prewarm

# Health check
curl -sS http://localhost:3000/api/health/queue
```

---

## 6) Start Dev Server
```bash
npm run dev
# http://localhost:3000
```

---

## 7) UI/API Smoke Tests

### API Test
```bash
curl -sS http://localhost:3000/api/achievements/my | jq
```

**Expected response:**
```json
{
  "ok": true,
  "progress": {
    "totalAttacks": 0,
    "distinctCountriesAttacked": 0,
    "referralCount": 0,
    "flagCount": 0
  },
  "defs": [...]
}
```

**Must NOT have:** `consecutiveActiveDays` field

### UI Test
1. Open: http://localhost:3000/achievements
2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Verify:
   - ✅ Grid shows categories 1, 2, 3, 5 only
   - ✅ Stats show "Flags Owned" card
   - ✅ NO "Consecutive Active Days" text

---

## 8) Flag Count Backfill (Test Wallet)
```bash
npx tsx scripts/backfill-flag-count-v2.ts 0xc32e33F743Cf7f95D90D1392771632fF1640DE16
```

**MongoDB verify:**
```javascript
db.achv_progress.findOne(
  {userId:"0xC32E33F743CF7F95D90D1392771632FF1640DE16"},
  {flagCount:1,totalAttacks:1,distinctCountriesAttacked:1,referralCount:1}
)
db.flags_snapshots.find(
  {userId:"0xC32E33F743CF7F95D90D1392771632FF1640DE16"}
).sort({ts:-1}).limit(2)
```

---

## 9) E2E Test: Buy → Attack

### Buy Flow
1. UI: Buy 1 flag
2. **Verify:**
   - `flags_snapshots` collection has new entry
   - `achv_progress.flagCount` incremented
   - Redis key `achv:my:<wallet>` cleared

### Attack Flow
1. UI: Attack another country
2. **Verify:**
   - `achv_progress.totalAttacks` incremented
   - `achv_progress.distinctCountriesAttacked` incremented (if new target)
   - `attacks` collection has entry (unique by `{txHash, logIndex}`)
   - Redis key `achv:my:<wallet>` cleared

**MongoDB check:**
```javascript
db.attacks.find().sort({ts:-1}).limit(3)
```

---

## 10) SBT Mint Flow

### Positive Test
1. UI: Achieve a threshold (e.g., 1 attack)
2. Click "Mint" button
3. **Verify:**
   - Preflight: USDC allowance check passes
   - Mint tx succeeds
   - `AchievementMinted` event emitted
   - DB: `achv_mints` collection has record

### Negative Test (Non-Transferable)
```javascript
const sbt = await ethers.getContractAt('AchievementsSBT', '0xcB63...21e9')
await expect(sbt.transferFrom(addrA, addrB, 1)).to.be.reverted
await expect(sbt.safeTransferFrom(addrA, addrB, 1)).to.be.reverted
await expect(sbt.approve(addrB, 1)).to.be.reverted
```

---

## 11) Health Checks
```bash
curl -sS http://localhost:3000/api/health/redis
# Expected: {"ok":true}

curl -sS http://localhost:3000/api/health/queue
# Expected: {"ok":true,"counts":{...}} if USE_QUEUE=true
```

---

## Go-Live Criteria (ALL must be ✅)

- [ ] UI: NO "Consecutive Active Days" text anywhere
- [ ] API: `/api/achievements/my` returns `flagCount`, no `consecutiveActiveDays`
- [ ] Redis: Cache invalidation works (key deleted after buy/sell/attack)
- [ ] MongoDB: `flags_snapshots` inserts correctly
- [ ] MongoDB: `achv_progress.flagCount` updates correctly
- [ ] MongoDB: `attacks` collection has unique writes (no duplicates)
- [ ] SBT: Mint flow works with 0.20 USDC fee
- [ ] SBT: Non-transferable (all transfer/approve calls revert)

---

## Mini Notes

1. **Queue:** If `USE_QUEUE=true`, ensure PM2 workers running and `/api/health/queue` returns `ok:true`
2. **logIndex:** If multiple Attack events in one tx, ensure unique `{txHash, logIndex}` key (extract from `receipt.logs`)
3. **Allowance:** Mint preflight already implemented (same pattern as attack page)
4. **Dev warning:** To silence `allowedDevOrigins` warning, add `127.0.0.1` to `next.config.js`

---

## Deployment Commands Summary
```bash
# 1. Clean
rm -rf .next node_modules/.cache .turbo
npx tsx scripts/clear-all-achievement-cache.ts

# 2. Seed
npx tsx scripts/init-achievements.ts

# 3. On-chain
npx hardhat run scripts/set-valid-levels.js --network baseSepolia

# 4. Build
npm run build

# 5. Start
npm run dev
# OR for production: npm start

# 6. Test
curl http://localhost:3000/api/achievements/my
```

---

## Status
✅ All pre-deployment tasks completed
🔄 Ready for go-live after manual UI verification

