# Free Attack Integration Update

## Overview
- Synchronized quest UI with real free-attack counts stored in MongoDB.
- Added real API endpoints for reading and granting free-attack allowances.
- Enforced one-time completion for the Communication Specialist quest (both backend + UI).
- Preserved on-chain attack flow; smart contract still decides whether an attack is free.

## Backend Changes
1. `app/api/free-attack/my/route.ts`
   - Validates `wallet` query param; returns explicit defaults when no record exists.
   - Ensures unique index on `free_attacks.wallet`.
   - Responds with `{ ok, awarded, used, remaining, totalLimit, delta }` using `remaining = max(0, min(awarded, totalLimit) - used)`.

2. `app/api/free-attack/use/route.ts`
   - Atomically increments `used` counter with `findOneAndUpdate` or `insertOne` fallback.
   - Enforces `MAX_FREE_ATTACKS_PER_USER` limit; returns `granted: false` when max is reached.
   - Optionally records `{ source, at }` history entries.

3. `app/api/quests/claim/route.ts`
   - Early exit when `wallet` already claimed `COMMUNICATION_SPECIALIST` (returns `code: 'ALREADY_CLAIMED'`).
   - Free-attack grant now only happens on the first successful claim and increments an `awarded` counter (leaving `used` untouched for on-chain consumption).

4. `app/api/quests/check-discord/route.ts`
   - Response includes `claimed` boolean derived from `quest_claims`.

5. `app/api/quests/my/route.ts`
   - New endpoint returning `{ quests: string[] }` for a wallet’s completed quests.

6. `lib/initDb.ts`
   - Added `uniq_wallet_free_attacks` index creation for `free_attacks` collection.
   - Added `uniq_wallet_quest` index on `(wallet, questKey)` to prevent duplicate quest claims.

## Quest Page Updates (`app/quests/page.tsx`)
- Introduced strict `freeAttackStats` state with `loaded` flag and backend-driven data.
- Added `refreshFreeAttackStats` helper used on page load, quest claim, modal open, and attack execution.
- Disabled “Launch Attack Now” button when:
  - Data is loaded and `remaining <= 0`, or
  - Modal pre-check determines no grants.
- Before opening the modal, re-fetches `/api/free-attack/my` and blocks if none available (toast feedback).
- Before executing an attack, re-fetches the latest stats and aborts if depleted.
- Removed optimistic decrement after attack success; now re-fetches from API for authoritative numbers.
- Display enhancements:
  - Shows loading state until data arrives.
  - Displays `delta` and remaining counts in the header card.
  - Reads quest completion state on mount via `/api/quests/my` and disables claim UI when already completed.
  - Claim handler surfaces `ALREADY_CLAIMED` via toast messaging.
  - Reward banner now nudges users to launch the in-page free attack instead of linking to `/attack`.
  - “Quest Completed” ribbon replaces action buttons once claimed.

## Testing Checklist
1. **No record scenario**
   - `/api/free-attack/my?wallet=…` returns `remaining: 0`.
   - Quest card shows `0 / 2`, button disabled, modal does not open.

2. **Single grant**
   - Insert `{ wallet: …, used: 0 }` via `/api/free-attack/use`.
   - Refresh quests page; button enabled; modal opens; attack executes after re-check.

3. **Runtime depletion**
   - Open modal
   - Delete free-attack record externally
   - Attempt attack; execution re-check aborts with toast, stats refresh to zero.

4. **Max limit enforcement**
   - Call `/api/free-attack/use` twice → `granted: true`
   - Third call → `granted: false`, `remaining: 0`
   - Quest UI reflects `0 / 2`, button disabled.

5. **Quest completion guard**
   - Complete quest once → UI shows completed banner, buttons disabled.
   - Second claim attempt returns `ALREADY_CLAIMED`, UI remains completed, toast shows info message.
   - `/api/quests/my?wallet=…` includes `'COMMUNICATION_SPECIALIST'`.

6. **Main attack page**
   - `/app/attack` flow unchanged; contract still waives fee when applicable.

## Notes
- Environment variable `MAX_FREE_ATTACKS_PER_USER` (default `2`) drives limits.
- Frontend never calls `/api/free-attack/use` during attack; usage should occur only when granting rewards (e.g., quest claim).
- Queue & fee handling untouched; free attacks continue to flow through existing pipelines.
- Quest-claim unique index is marked `sparse` to avoid build failures on legacy records, preventing the `/quests` Internal Server Error observed earlier.
