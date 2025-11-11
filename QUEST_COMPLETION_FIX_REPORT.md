# Quest Completion / Free-Attack Sync Report

## Scope
- Ensure Discord quest can only be completed once and UI stays in “completed” mode.
- Keep awarded free attacks persistent across reloads and modal checks.
- Avoid unnecessary regressions in attack flow or other pages.

## Backend Changes
1. `app/api/quests/claim/route.ts`
   - Early exit when `{ wallet, questKey: 'COMMUNICATION_SPECIALIST' }` exists → returns `{ ok: false, code: 'ALREADY_CLAIMED' }`.
   - On first claim: increments `free_attacks.awarded`, preserves `used`, and inserts quest record with `wallet`, `questKey`, `questId`, `claimedAt`.
   - Response normalized to `{ ok: true, claimed: true, questKey, freeGiven: 1 }`.

2. `app/api/quests/check-discord/route.ts`
   - Response now includes `claimed` flag derived from `quest_claims` lookup (no UI resets).

3. `app/api/quests/my/route.ts`
   - Returns `{ ok, quests: string[] }` for the wallet (supports initial UI load).

4. `app/api/free-attack/my/route.ts`
   - Returns `{ awarded, used, remaining, totalLimit, delta }` using `remaining = max(0, min(awarded, totalLimit) - used)`.
   - Does not zero-out state when fetch fails; only marks `loaded`.

5. `lib/initDb.ts`
   - Ensures indexes:
     - `free_attacks`: `uniq_wallet_free_attacks`
     - `quest_claims`: `uniq_wallet_quest` (sparse) to avoid legacy duplicates.

## Frontend Changes (`app/quests/page.tsx`)
- Added `fetchFreeAttackStats` helper with non-destructive fallback.
- Maintains `awarded` in state; progress bar reflects `min(awarded, totalLimit)`.
- On mount, `/api/quests/my` determines initial `claimed` status.
- `handleCheck` no longer mutates `claimed`; just updates status.
- `handleClaim` logic:
  - If `ALREADY_CLAIMED` → set `claimed`, refresh free-attack stats, show info toast.
  - If new claim succeeds → set `claimed`, refresh stats, success toast.
  - Otherwise, toasts `data.message` (requirements not met etc.).
- Reward panel encourages in-page launch; no `/attack` link.
- Single “Quest Completed!” banner (buttons disabled post-claim).
- Attack modal open/execute always re-validates via shared helper without wiping state on network hiccups.

## Testing
1. Fresh wallet → `/api/quests/my` empty; UI shows claim button.
2. Claim once → UI flips to completed; `/api/quests/my` includes quest; free attacks remain awarded.
3. Claim again → backend returns `ALREADY_CLAIMED`; UI remains completed; toast shown.
4. `/api/free-attack/my` reflects `{ awarded, used, remaining }` accurately.
5. Modal open without free attacks displays error toast and does not open.
6. Main attack page untouched.

## Notes
- All commands executed with `pnpm dev -p 3000`. No other files modified.
- No tests were run; manual verification through browser and API calls.

