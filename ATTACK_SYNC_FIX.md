# Attack Achievement Progress Sync Fix

## Problem
After attacking 2 different countries, UI still shows "1 Countries Attacked" instead of "2".

## Root Cause
The `attack-events` worker was:
1. ✅ Writing to `attacks` collection (DB audit)
2. ✅ Clearing Redis cache
3. ❌ **NOT calling `syncProgressAfterAttack()`** to update achievement progress

## Fix Applied
Added achievement progress sync to `workers/attack-events.worker.ts`:

```typescript
// After cache invalidation and DB write
await syncProgressAfterAttack(data.user, data.toId)
```

This function:
1. Increments `totalAttacks` in `achv_progress`
2. Adds `toId` to `attackedCountries` array (unique set)
3. Calculates `distinctCountriesAttacked` from array length
4. Updates earned levels
5. Clears `achv:my:<user>` cache

## Files Changed
- `workers/attack-events.worker.ts`: Added `syncProgressAfterAttack()` call

## Verification
After fix:
1. Attack country A → `distinctCountriesAttacked = 1`
2. Attack country B → `distinctCountriesAttacked = 2` ✅
3. Attack country A again → `distinctCountriesAttacked = 2` (no duplicate)
4. UI shows correct count after cache refresh

## Worker Restart Required
```bash
# If using PM2
pm2 restart fw-attack

# Or start manually
npm run worker:attack
```

## Test
1. Make 2 different attacks
2. Check `achv_progress` in MongoDB:
   ```javascript
   db.achv_progress.findOne({userId: "0xYOUR_ADDRESS"}, {distinctCountriesAttacked: 1, attackedCountries: 1})
   ```
3. Verify UI shows correct count (hard refresh: Ctrl+Shift+R)

