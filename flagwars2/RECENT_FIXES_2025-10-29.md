# Recent Fixes and Verifications — 2025-10-29

## Scope
- Redis and Next.js build cache cleanup
- Port 3000 process conflict resolution and dev server bring-up
- Achievements data model cleanup (remove Consecutive Days, add Flag Count)
- MongoDB reseed for achievements definitions and indexes
- Cache invalidation for achievements and inventory
- Flag Count backfill for user wallet

---

## 1) Environment & Health
- Next.js: 14.2.33 (dev)
- URL: http://localhost:3000
- ENV: .env.local loaded
- MongoDB: connected (ping OK)
- Redis: connected (cache ops successful)

Known warning (dev):
- allowedDevOrigins warning for 127.0.0.1 → Only a development console warning; no functional impact.

How to silence warning (optional): add 127.0.0.1/localhost into `next.config.js` allowedDevOrigins per Next.js docs.

---

## 2) Redis & Build Cleanup
Ran full cleanup:
- Deleted Redis keys: `achv:*`, `ach:*`, `achievement:*`, `inv:*`
- Removed `.next`, `node_modules/.cache`, `.turbo`
- Result: Fresh dev build and no stale cache

Scripts used:
- `scripts/clear-cache.ts`
- `scripts/clear-all-achievement-cache.ts`

---

## 3) Port 3000 Resolution
- Identified Node process listening on 3000 and terminated (Windows PID shown in terminal)
- Restarted `npm run dev`
- Status: Port 3000 active, server responding

---

## 4) Achievements Data Model Cleanup
Goal: Remove Category 4 (Consecutive Days), add Category 5 (Flag Count), correct Multi-Country thresholds.

Actions:
- Confirmed UI (`app/achievements/page.tsx`) shows only categories {1,2,3,5}
- API `/api/achievements/my` returns progress without `consecutiveActiveDays`, includes `flagCount`
- `lib/schemas/achievements.ts` enum and thresholds:
  - MULTI_COUNTRY thresholds: [1, 5, 15, 35]
  - FLAG_COUNT thresholds: [5, 50, 250, 500]
- Removed all Consecutive Days logic from backend sync code and UI

DB reseed (drop+seed safely):
- Script: `scripts/init-achievements.ts`
- Collections dropped: `achv_defs`, `achv_progress`, `achv_mints` (and created indexes)
- Seeded definitions:
  - 1 Attack Count
  - 2 Multi-Country Attack (35 corrected)
  - 3 Referral Count
  - 5 Number of Total Flags

Verification (direct DB check):
- `scripts/check-achievement-defs-direct.ts`
- Result: No Category 4 present; Category 5 present with correct thresholds

---

## 5) Cache Invalidation
- Achievements user cache key: `achv:my:<user>` purged after reseed and backfill
- Inventory keys `inv:*` purged
- Next.js assets rebuilt (fresh `.next`)

---

## 6) User Flag Count Backfill
Wallet: `0xc32e33F743Cf7f95D90D1392771632fF1640DE16`

Method:
- Read `countries(id)` → token
- Read token `balanceOf(wallet)` for active and iterated countries
- Count tokens with balance > 0

Scripts used:
- `scripts/backfill-flag-count.ts` (initial attempt)
- `scripts/backfill-flag-count-v2.ts` (final, robust version)

Result:
- Owned flags found: 0
- Updated `achv_progress.flagCount = 0`
- Recalculated earned levels for category 5 → none
- Cleared Redis user cache keys

Notes:
- If profile page shows flags, confirm network (Base Sepolia) and that tokens exist for current Core.
- Profile inventory API can be used to cross-check balances.

---

## 7) UI Status
- Achievements grid shows 1/2/3/5 only
- Progress stats include `Flags Owned` card
- If "Consecutive Active Days" is still visible in the browser, it is a client cache artifact; hard refresh (Ctrl+Shift+R) or incognito clears it.

---

## 8) Quick Verification Checklist
- [x] Port 3000 running and serving pages
- [x] MongoDB defs: 1,2,3,5 only; 2 uses 35 (not 40)
- [x] Redis achievements keys purged
- [x] `/api/achievements/my` returns `flagCount` and no consecutive field
- [x] UI stats show `Flags Owned`
- [x] Backfill completed for provided wallet (`flagCount=0`)

---

## 9) Operational Commands
- Start dev: `npm run dev`
- Rebuild clean: delete `.next`, then `npm run dev`
- Reseed achievements: `npx tsx scripts/init-achievements.ts`
- Check defs: `npx tsx scripts/check-achievement-defs-direct.ts`
- Clear caches: `npx tsx scripts/clear-all-achievement-cache.ts`
- Backfill flag count: `npx tsx scripts/backfill-flag-count-v2.ts <wallet>`

---

## 10) Next Recommendations
- If profile shows non-zero flags while backfill shows 0:
  - Verify `NEXT_PUBLIC_CORE_ADDRESS` and active countries are aligned
  - Run profile inventory once to repopulate DB from chain for that user
  - Re-run backfill to sync `flagCount`
- Optional: add `127.0.0.1` to `allowedDevOrigins` to suppress dev warning

---

## 11) On-Chain Valid Levels Update
**Status**: Pending manual execution

Script created: `scripts/set-valid-levels-onchain.ts` (TypeScript version)

Execute via Hardhat console:
```bash
npx hardhat console --network baseSepolia
```

In console:
```javascript
const sbt = await ethers.getContractAt('AchievementsSBT', '0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9')

// Fix Multi-Country (category 2)
await sbt.setValidLevel(2, 35, true)
await sbt.setValidLevel(2, 40, false)

// Add Flag Count (category 5)
await sbt.setValidLevelsBatch(5, [5, 50, 250, 500], true)

// Verify
await sbt.validLevels(2, 35) // true
await sbt.validLevels(2, 40) // false
await sbt.validLevels(5, 50) // true
```

**OR** use existing .js script:
```bash
npx hardhat run scripts/set-valid-levels.js --network baseSepolia
```

---

## 12) Change Log (today)
- Redis & build caches fully cleaned
- Killed lingering Node process on 3000 and relaunched dev server
- Dropped & re-seeded achievements collections (removed Cat 4, added Cat 5, fixed Cat 2 threshold)
- Purged achievements/inventory caches
- Backfilled Flag Count for the provided wallet (0)
- Created on-chain update script for valid levels (pending manual execution)
