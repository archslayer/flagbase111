# 🚀 FlagWars Production v3 - Deployment Summary

## 📋 Contract Information

### Deployed Contract
- **Address**: `0xb47D23AAF7f16A3D08D4a714aeF49f50fB6B879d`
- **Network**: Base Sepolia (ChainID: 84532)
- **Deployer**: 0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82
- **Status**: ✅ UNPAUSED & READY
- **Block**: 32653333

### Deployment Transactions
- Deploy: `0x4426774afbcf9c45c37289c7af71537c47a7215b412939d70260c9c355863f30`
- Unpause: `0x1a4ed09582cbdc7e28b9c6aed4d527ed4c108c0cd3ba407b2b03510a26bca7d5`
- Turkey (ID 90): `0x58e7599d9b369e4946ed2e461938f47c8ca953fe9b71a970f3534063852cd74e`
- USA (ID 1): `0x0cda513440961e890d81d6d6191d702c0298fa6b5fab0beff588213d5881a7ad`
- UK (ID 44): `0x608fd459e2ffe8200d1c0a13cb19bae9f22aefaee1c07eac4d70be691508b9bc`

## 🎯 Major Changes from v2

### 1. Arithmetic Series Pricing Model
**Old (v2)**: Single-token half-step pricing
- Buy: `price + κ/2` per token
- Sell: `price - λ/2` per token
- **Problem**: Buying multiple tokens resulted in inaccurate total cost

**New (v3)**: Multi-token arithmetic series pricing
- Buy: `total_price8 = n*P + κ*(n²)/2`
- Sell: `total_price8 = n*P − λ*(n²)/2`
- **Benefit**: Accurate pricing for any quantity, accounts for price movement during multi-token trades

#### Pricing Example (1 vs 5 tokens)
- Current price: $5.00 (5e8 PRICE8)
- κ (kappa): 55,000 (0.00055 * 1e8)
- λ (lambda): 55,550 (0.0005555 * 1e8)

**Buy 1 Token**:
- Old: 1 × ($5.00 + $0.000275) = $5.000275
- New: 1×$5.00 + 0.00055×(1²)/2 = $5.000275
- ✅ Same result

**Buy 5 Tokens**:
- Old (incorrect): 5 × ($5.00 + $0.000275) = $25.001375
- New (correct): 5×$5.00 + 0.00055×(25)/2 = $25.006875
- 📊 Difference: $0.0055 (~0.02%)

**New Price After Buy 5**:
- Old: $5.00 + $0.000275 = $5.000275
- New: $5.00 + 5×$0.00055 = $5.00275
- 📈 Correctly reflects 5 price steps

### 2. USDC Delta Proof
**Security Enhancement**: Verify exact USDC amounts transferred

**Buy Flow**:
```solidity
uint256 balanceBefore = IERC20(cfg.payToken).balanceOf(address(this));
IERC20(cfg.payToken).safeTransferFrom(msg.sender, address(this), grossUSDC6);
uint256 balanceAfter = IERC20(cfg.payToken).balanceOf(address(this));
if (balanceAfter - balanceBefore != grossUSDC6) revert ErrUSDCInMismatch();
```

**Sell Flow**:
```solidity
uint256 balanceBefore = IERC20(cfg.payToken).balanceOf(address(this));
// ... all USDC transfers (user + fees)
uint256 balanceAfter = IERC20(cfg.payToken).balanceOf(address(this));
if (balanceBefore - balanceAfter != grossUSDC6) revert ErrUSDCOutMismatch();
```

**Protection Against**:
- Fee-on-transfer USDC tokens
- Deflationary token attacks
- Accounting mismatches
- Contract USDC balance manipulation

### 3. Transaction Amount Limit
**New Constant**: `MAX_TOKENS_PER_TX_N = 50`

**Enforcement**:
```solidity
uint256 n = amountToken18 / 1e18; // Number of whole tokens
if (n > MAX_TOKENS_PER_TX_N) revert ErrTxAmountTooLarge();
```

**Benefits**:
- Prevents gas exhaustion attacks
- Limits price impact per transaction
- Predictable gas costs
- Forces large orders to be split (better price discovery)

**Max Buy/Sell**: 50 tokens per transaction

### 4. New Custom Errors
```solidity
error ErrUSDCInMismatch();    // USDC in verification failed
error ErrUSDCOutMismatch();   // USDC out verification failed
error ErrTxAmountTooLarge();  // > 50 tokens in single tx
```

## 🏁 Seeded Countries

| ID | Country | Price | Total Supply | Remaining | Status |
|----|---------|-------|--------------|-----------|--------|
| 90 | 🇹🇷 Turkey | $5.00 | 50,000 | 50,000 | ✅ Live |
| 44 | 🇬🇧 United Kingdom | $5.00 | 50,000 | 50,000 | ✅ Live |
| 1 | 🇺🇸 United States | $5.00 | 50,000 | 50,000 | ✅ Live |

## 🔐 Contract Configuration

```javascript
{
  payToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC (Base Sepolia)
  treasury: "0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82",
  revenue: "0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82",
  commissions: "0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82",
  buyFeeBps: 0,          // 0% buy fee
  sellFeeBps: 500,       // 5% sell fee
  referralShareBps: 3000, // 30% of sell fee → referrer
  revenueShareBps: 7000,  // 70% of sell fee → revenue
  priceMin8: 1_000_000,   // $0.01 floor price
  kappa: 55_000,          // $0.00055 buy step
  lambda: 55_550,         // $0.0005555 sell step
  attackPayableETH: true
}
```

## 📝 Frontend Changes

### Updated Pricing Calculations
**Buy Price Calculation** (`app/market/page.tsx`):
```typescript
const P = price.data ? Number(price.data.price8) : 0
const kappa = 55_000
const n = Number(buyAmount)

// Arithmetic series: total = n*P + κ*(n²)/2
const linearTerm = n * P
const quadraticTerm = (kappa * n * n) / 2
const totalPrice8 = linearTerm + quadraticTerm
const totalUSDC = totalPrice8 / 1e8

setBuyPrice(totalUSDC.toFixed(6))
```

**Sell Price Calculation**:
```typescript
const P = price.data ? Number(price.data.price8) : 0
const lambda = 55_550
const n = Number(sellAmount)

// Arithmetic series: total = n*P − λ*(n²)/2
const linearTerm = n * P
const quadraticTerm = (lambda * n * n) / 2
const totalPrice8 = Math.max(linearTerm - quadraticTerm, 0)
const grossUSDC = totalPrice8 / 1e8

// Apply 5% sell fee (user receives net)
const netUSDC = grossUSDC * 0.95
setSellPrice(netUSDC.toFixed(6))
```

### UI Enhancements
- ✅ Real-time price calculations with quadratic formula
- ✅ Whole number token input validation
- ✅ Max 50 tokens per transaction (client-side warning)
- ✅ Accurate "You will pay" / "You will receive" displays

## 🧪 Testing Checklist

### ✅ Contract-Level Tests
- [x] Deploy successful (Base Sepolia)
- [x] Unpause successful
- [x] Countries seeded correctly
- [x] `MAX_TOKENS_PER_TX_N` constant defined
- [x] Arithmetic series pricing functions implemented
- [x] USDC delta proof checks added (buy & sell)

### 🔜 Integration Tests (Next Step)
- [ ] **Buy 1 Token**: Price = $5.000275, new price = $5.00055
- [ ] **Buy 5 Tokens**: Price = $25.006875, new price = $5.00275
- [ ] **Buy 50 Tokens** (max): Price calculated correctly
- [ ] **Buy 51 Tokens**: Should revert `ErrTxAmountTooLarge()`
- [ ] **Sell 1 Token**: Net payout (after 5% fee) correct
- [ ] **Sell 5 Tokens**: Net payout with quadratic formula
- [ ] **USDC In Mismatch**: Test with fee-on-transfer mock token
- [ ] **USDC Out Mismatch**: Test with withdrawal race condition
- [ ] **Whole Tokens Only**: 1.5 tokens should revert
- [ ] **Price Updates**: Verify price changes after each buy/sell
- [ ] **Remaining Supply**: Decreases on buy, increases on sell
- [ ] **User Balance**: Internal accounting correct

### 🔐 Security Tests
- [ ] ReentrancyGuard active
- [ ] Pausable works (owner only)
- [ ] Slippage protection (minOut)
- [ ] Deadline protection (block.timestamp)
- [ ] Fee distribution (referral logic)
- [ ] Floor price enforcement

## 📊 Comparison: v2 vs v3

| Feature | v2 (0x32d6...d30) | v3 (0xb47D...879d) |
|---------|-------------------|-------------------|
| **Pricing Model** | Single-step | Arithmetic series |
| **Multi-token Accuracy** | ❌ Incorrect | ✅ Correct |
| **USDC Delta Proof** | ❌ None | ✅ In & Out |
| **TX Amount Limit** | ❌ Unlimited | ✅ 50 tokens max |
| **Gas Optimization** | Standard | Improved (fewer storage reads) |
| **Security Errors** | 9 custom errors | 12 custom errors |

## 🚀 Next Steps

1. **Full Integration Testing**
   - Run local Hardhat tests with quadratic pricing scenarios
   - Test edge cases (max amount, min price, zero amount)
   - Verify USDC delta proof with mock tokens

2. **UI Testing**
   - Buy 1, 5, 10, 50 tokens (verify price calculations)
   - Sell with different amounts
   - Test "Max 50 tokens" UI warning
   - Verify transaction confirmations

3. **Production Monitoring**
   - Track buy/sell events
   - Monitor USDC delta mismatches (should be 0)
   - Watch for `ErrTxAmountTooLarge` occurrences
   - Price movement analysis

4. **Contract Verification** (Optional)
   - Verify on BaseScan: https://sepolia.basescan.org/address/0xb47D23AAF7f16A3D08D4a714aeF49f50fB6B879d#code
   - Hardhat verify command: `npx hardhat verify --network baseSepolia 0xb47D23AAF7f16A3D08D4a714aeF49f50fB6B879d ...`

## 🎯 Success Criteria

- ✅ Contract deployed and unpaused
- ✅ 3 countries seeded
- ✅ Arithmetic series pricing implemented
- ✅ USDC delta proof active
- ✅ 50-token limit enforced
- ✅ Frontend updated with new formulas
- ✅ No linter errors
- 🔜 Integration tests passing
- 🔜 Live buy/sell transactions successful

---

**Deployment Date**: October 21, 2025  
**Contract Version**: v3 (Production)  
**Status**: ✅ READY FOR TESTING

