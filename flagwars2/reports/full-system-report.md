# FlagWars Full System Report

Generated: 2025-10-20T15:51:19.145Z

## ENV & Sanity

| Item | Status | Detail |
|---|---|---|
| DATABASE_URL | ✅ | present |
| JWT_SECRET | ✅ | present |
| NEXT_PUBLIC_CORE_ADDRESS | ✅ | 0x40d06FC3c37854E9248be4184ee1161C44af7D48 |
| NEXT_PUBLIC_RPC_BASE_SEPOLIA | ✅ | https://sepolia.base.org |
| REDIS_URL | ❌ | missing (required if USE_REDIS=true) |

**Result:** ❌ FAIL

## DB Health
- Ping: ✅
- Collections (first 10): users, wallet_day_counters, invites, trades, quest_progress, achievements, white_flag_config, achievement_progress, wf2_halts, quests

**Result:** ✅ PASS

## Redis Health
**Error:** connect ECONNREFUSED ::1:6379

**Result:** ❌ FAIL

## Routes Guard (no auth cookie)

- `/`: got 200, want 200 ✅ — public
- `/market`: got 200, want 200 ✅ — public
- `/profile`: got 307, want 307 ✅ — should redirect to /?r=/profile
  - Location: /?r=%2Fprofile
- `/achievements`: got 307, want 307 ✅ 
  - Location: /?r=%2Fachievements
- `/quests`: got 307, want 307 ✅ 
  - Location: /?r=%2Fquests
- `/attack`: got 307, want 307 ✅ 
  - Location: /?r=%2Fattack

**Result:** ✅ PASS

## Auth Flow
- /api/auth/nonce: 200 ✅
- /api/me (no cookie): 401 ✅

**Result:** ✅ PASS (manual signing required in UI)

## Contract Read Health

- Country 90 price8: 500055000

- Country 44 price8: 499972500

**Result:** ✅ PASS

## Idempotency — /api/trade/buy

- First call: 200
- Second (same body): 200 (expect 409 pending or 200 cached)

**Result:** ✅ PASS (behavior consistent)**


## SSE (optional)
**Error (unhandled):** read ECONNRESET

**Result:** ❌ FAIL
