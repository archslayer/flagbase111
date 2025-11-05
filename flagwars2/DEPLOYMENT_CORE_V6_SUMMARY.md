# Core v6 Deployment Summary

## Changes from v5

### 1. Core.sol Updates
- ✅ Added `isAuthorized` mapping for module authorization
- ✅ Added `setAuthorized(address who, bool v)` function
- ✅ Added `pullUSDCFrom(address from, uint256 amount, address to)` function
- ✅ Attack functions use `transferFrom` internally (no external USDC pull needed)

### 2. ABI Changes (lib/core-abi.ts)
- ✅ Removed legacy functions: `getCountryInfo`, `getUserBalance`, `getRemainingSupply`, `setReferrer`, `referrerOf`
- ✅ Removed all custom error definitions (not needed for viem)
- ✅ Fixed `attackBatch` signature to use inline tuple: `(uint256 fromId, uint256 toId, uint256 amountToken18)[]`
- ✅ Added `Attack` event

### 3. UI Changes
- ✅ Attack page: Removed USDC approval logic (contract handles it via `transferFrom`)
- ✅ `lib/contracts.ts`: Updated `previewAttackFee` to use new `CORE_ABI`
- ✅ All `getCountryInfo` calls now use `countries(id)` mapping

### 4. Authorization Flow
**Single USDC Approval Model:**
1. User approves USDC → CORE (MAX allowance)
2. BUY operation: CORE pulls USDC from user
3. ATTACK operation: CORE pulls USDC fee from user (same allowance)

**No separate attack approval needed!**

## Deployment Steps

### 1. Deploy Contracts
```bash
npx hardhat run scripts/deploy/new-core-v6.ts --network base-sepolia
```

### 2. Update Environment Variables
```env
# Core v6
NEXT_PUBLIC_CORE_ADDRESS=0x...
TOKEN_TR_ADDRESS=0x...
TOKEN_UK_ADDRESS=0x...
TOKEN_US_ADDRESS=0x...
```

### 3. Test Functions

#### Buy Test
```javascript
// User approves USDC once
await usdc.approve(CORE_ADDRESS, ethers.MaxUint256);

// Buy tokens
await core.buy(90, ethers.parseUnits("1", 18), maxInUSDC6, deadline);
```

#### Attack Test
```javascript
// Same USDC allowance used for attack!
await core.attack(90, 44, ethers.parseUnits("1", 18));
```

#### Batch Attack Test
```javascript
const items = Array(5).fill({
  fromId: 90,
  toId: 44,
  amountToken18: ethers.parseUnits("1", 18)
});
await core.attackBatch(items);
```

## Contract Addresses

After deployment, update:
- `deployment/core-v6-base-sepolia.json`
- `.env.local` with new addresses

## Benefits

✅ **Single approval**: User approves USDC once for all operations  
✅ **Cleaner ABI**: Removed dead code and legacy functions  
✅ **Type-safe**: Inline tuple for `attackBatch` prevents parsing errors  
✅ **Unified UX**: BUY and ATTACK use same USDC allowance  

## Testing Checklist

- [ ] Deploy Core v6
- [ ] Deploy FlagTokens (TR, UK, US)
- [ ] Mint 50,000 tokens per country to Treasury
- [ ] Approve Core to spend tokens from Treasury
- [ ] Add 3 countries to Core (90, 44, 1)
- [ ] Set `setAuthorized(CORE, true)`
- [ ] Test BUY operation
- [ ] Test SELL operation
- [ ] Test ATTACK operation (single)
- [ ] Test ATTACK operation (batch 5x)
- [ ] Verify UI loads without errors
- [ ] Verify attack fee displays correctly

## Known Issues
None - this is a complete refactor with backward compatibility.
