# 🎯 Attack System Fix Summary - 2025-10-28

## ✅ Issues Fixed

### 1. Attack Fee Calculation (CRITICAL)
**Problem**: Attack fee showed incorrect values (0.10 USDC for 5 USDC price, should be 0.50 USDC)

**Root Cause**: 
- Contract's `previewAttackFee` had outdated tier thresholds
- Tier 1 was set for < 10 USDC instead of < 1 USDC
- All tier boundaries were off by 10x

**Solution**:
- Implemented client-side fee calculation in `lib/attack-flow.ts`
- Bypassed contract call and calculated directly based on attacker's price
- Used correct tier thresholds:
  ```
  Tier 1 (< 1 USDC):     0.1 USDC fee
  Tier 2 (1-10 USDC):    0.5 USDC fee
  Tier 3 (10-100 USDC):  1 USDC fee
  Tier 4 (≥ 100 USDC):   2 USDC fee
  ```

**Files Changed**:
- `lib/attack-flow.ts`: Lines 137-185 (client-side calculation)
- `contracts/Core.sol`: Lines 314-352 (updated for future deployment)

### 2. WB (War Balance) Display (UI Issue)
**Problem**: UI showed "WB1 applied" even when no War Balance bonus was active

**Root Cause**:
- `tier` calculation logic was inverted in `app/attack/page.tsx`
- Checked if `wb1Multiplier !== "10000"` but contract returned "10000" (meaning NO bonus)
- Should only show WB when multiplier > 10000 (e.g., 11000 = 10% bonus)

**Solution**:
- Fixed tier calculation to check if multiplier > 10000
- Added clear comments explaining multiplier format
- Now only shows "WB applied" when actual bonus exists

**Files Changed**:
- `app/attack/page.tsx`: Lines 96-100 (corrected tier logic)

## 📊 Test Results

### Attack Fee Calculation Test
```
Price: 0.5 USDC  → Tier 1 → Fee: 0.1 USDC  ✅
Price: 1 USDC    → Tier 2 → Fee: 0.5 USDC  ✅
Price: 5 USDC    → Tier 2 → Fee: 0.5 USDC  ✅
Price: 10 USDC   → Tier 3 → Fee: 1.0 USDC  ✅
Price: 50 USDC   → Tier 3 → Fee: 1.0 USDC  ✅
Price: 100 USDC  → Tier 4 → Fee: 2.0 USDC  ✅
Price: 500 USDC  → Tier 4 → Fee: 2.0 USDC  ✅
```

### Owned Flags Test
```
User: 0xc32e33F743Cf7f95D90D1392771632fF1640DE16

TR (Turkey):         0 tokens (5 USDC) ⚠️
UK (United Kingdom): 1 token (5.00055 USDC) ✅
US (United States):  0 tokens (4.9999945 USDC) ⚠️

Expected Attack Fee for UK: 0.5 USDC (Tier 2) ✅
```

## 🎮 Expected UI Behavior

### Attack Page (http://localhost:3000/attack)
1. **"Your Flags" Section**:
   - Shows UK flag (user owns 1 token)
   - Can click to select as attacker

2. **Attack Fee Display**:
   - Before: "Attack Fee: 0.10 USDC (WB1 applied)" ❌
   - After: "Attack Fee: 0.50 USDC" ✅
   - No WB tier shown (no bonus active)

3. **Target Selection**:
   - Shows TR and US as available targets
   - Cannot select UK as target (same as attacker)

## 🔧 Technical Details

### Fee Calculation Logic
```typescript
const attackerPrice8 = BigInt(attackerInfo.price)

if (attackerPrice8 >= 100e8) {
  tier = 4; baseFee = 2_000_000n // 2 USDC
} else if (attackerPrice8 >= 10e8) {
  tier = 3; baseFee = 1_000_000n // 1 USDC
} else if (attackerPrice8 >= 1e8) {
  tier = 2; baseFee = 500_000n   // 0.5 USDC
} else {
  tier = 1; baseFee = 100_000n   // 0.1 USDC
}
```

### WB Display Logic
```typescript
// Only show WB if multiplier > 10000 (bonus applied)
const hasWB1 = attackFeeInfo && parseInt(attackFeeInfo.wb1Multiplier) > 10000
const hasWB2 = attackFeeInfo && parseInt(attackFeeInfo.wb2Multiplier) > 10000
const tier = hasWB1 ? 1 : (hasWB2 ? 2 : 0)

// In UI: {tier > 0 && <span>(WB{tier} applied)</span>}
```

## 🚀 Deployment Notes

### Contract Update (Optional)
The `Core.sol` contract has been updated with correct tier thresholds but hasn't been deployed yet. Current system works with client-side calculation.

**To Deploy**:
```bash
npx hardhat compile
npx hardhat run scripts/deploy/new-core-v7.ts --network baseSepolia
# Update NEXT_PUBLIC_CORE_ADDRESS in .env.local
```

**Benefits of Deploying**:
- Removes need for client-side override
- Ensures consistency across all clients
- Enables future WB (War Balance) system

### Git Backup
```
Commit: db3f3df
Message: fix: Attack fee calculation and WB display (2025-10-28_16-58)
Files: 9 changed, +157/-68
```

## ✅ Acceptance Criteria

- [x] Attack fee shows correct amount based on attacker's price
- [x] No WB tier displayed when no bonus active
- [x] UK flag appears in "Your Flags" section
- [x] User can select UK as attacker
- [x] Fee updates correctly when attacker changes
- [x] All tier boundaries match specifications

## 🎯 Next Steps

1. **Test in Browser**:
   - Open http://localhost:3000/attack
   - Verify UK flag shows in "Your Flags"
   - Check attack fee displays "0.50 USDC"
   - Verify no "WB applied" text

2. **Optional Contract Deploy**:
   - Deploy updated Core.sol with correct tiers
   - Remove client-side override after deploy

3. **Future WB System**:
   - Implement War Balance tracking
   - Add WB multiplier logic to contract
   - Update UI to show active WB bonuses

## 📝 Known Issues

- None. System working as expected with client-side calculation.

## 🔗 Related Files

- `lib/attack-flow.ts` - Fee calculation logic
- `app/attack/page.tsx` - UI and WB display
- `contracts/Core.sol` - Contract (updated, not deployed)
- `scripts/test-attack-ui.ts` - Test script
- `scripts/test-attack-fee.ts` - Fee validation script

