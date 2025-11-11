# Quest Backend Fix Report

## Updated Scope
- `app/api/free-attack/my/route.ts`
- `app/api/quests/claim/route.ts`
- `app/api/quests/my/route.ts`
- `app/api/quests/debug/route.ts` (new diagnostic endpoint)

No frontend files were touched.

## Findings & Fixes

### 1. Free-Attack Stats Endpoint Returned Errors
- **Issue:** `GET /api/free-attack/my` returned `{ ok: false }` for missing/invalid wallets or internal errors. The page dismissed these responses, resetting remaining attacks to zero.
- **Fix:** The endpoint now always responds with `{ ok: true, ... }`, defaulting to zeroed stats when data is missing or an error occurs, and normalizes `totalLimit`, `awarded`, `used`, and `remaining`.

### 2. quests/my Response Normalization
- **Issue:** The endpoint returned HTTP 400/500 with `{ ok: false }`, causing the client to drop `claimed` state.
- **Fix:** `GET /api/quests/my` now always returns `{ ok: true, quests: [...] }`, defaulting to an empty list on missing wallet or errors. Quest IDs are normalized by mapping `questKey ?? questId`.

### 3. Quest Claim Flow Was Not Seeding free_attacks on Re-Load
- **Issue:** Wallets that already had a quest claim but no `free_attacks` document would never see a free attack counted.
- **Fix:** `POST /api/quests/claim` now:
  - Upserts an entry into `free_attacks` before returning the early `{ ok: true, claimed: true, code: 'ALREADY_CLAIMED' }` response.
  - For fresh claims, inserts into `quest_claims` and upserts `free_attacks` with `awarded += 1`, returning `{ ok: true, claimed: true, questKey, freeGiven: 1 }`.
  - Maintains HTTP 200 responses so the frontend keeps its `claimed` state.

### 4. Added Diagnostic Endpoint
- **New route:** `GET /api/quests/debug?wallet=...`
- **Purpose:** Quickly inspect `quest_claims`, `free_attacks`, and `achv_progress` documents for a wallet to confirm backend state during debugging.

## Verification
- `curl http://localhost:3000/api/free-attack/my?...` → `{"ok":true,"awarded":0,"used":0,"remaining":0,"totalLimit":2,"delta":0.0005}`
- `curl http://localhost:3000/api/quests/my?...` → `{"ok":true,"quests":[]}`
- `curl http://localhost:3000/api/quests/debug?...` → Shows raw DB state (e.g. quest claim present, free_attacks null before first fresh claim).
- After resetting the test wallet via a temporary script, the quest can be re-tested from a clean slate.

## Next Steps
- Retest quest flow end-to-end (connect Discord → check → claim → verify free attack increments).
- Use `/api/quests/debug?wallet=...` to inspect state if the UI still shows incorrect status.

