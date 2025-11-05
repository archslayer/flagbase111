# FlagWars v2 - Production Deployment

## 📋 Deployment Summary

**Network**: Base Sepolia (Chain ID: 84532)  
**Deployment Date**: October 22, 2025  
**Deployer**: `0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82`

---

## 🎯 Contract Addresses

### Core Contract
```
FlagWarsCore_Production: 0xBe9941784f3B7Fe6eF670E65c988719709bAcD0e
```

**Deployment Tx**: `0xccff4b9e95cac9d573829e713004dde5758a68c4e0518a02623475dcd91f4515`  
**Block**: 32673381

### Token Addresses
```
USDC (Base Sepolia): 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

---

## ⚙️ Configuration

### Trading Parameters
- **Buy Fee**: 0%
- **Sell Fee**: 5%
- **Referral Share**: 30% (of sell fee)
- **Revenue Share**: 70% (of sell fee)
- **Price Floor**: 0.01 USDC
- **Buy Price Step (κ)**: 0.00055 USDC
- **Sell Price Step (λ)**: 0.0005555 USDC
- **Max Tokens Per TX**: 50 tokens

### Attack System
- **Fee Mode**: USDC (6 decimals)
- **Rate Limits**:
  - Per-target: 5 attacks/minute
  - Total: 20 attacks/minute
- **Batch Size**: Max 5 attacks per transaction

#### Attack Tiers (Price-Based)
| Price Range | Delta (Δ) | Fee (USDC) |
|-------------|-----------|------------|
| ≤ $5.00 | 0.0011 | 0.30 |
| $5.01 - $10.00 | 0.0009 | 0.35 |
| $10.01 - $15.00 | 0.0007 | 0.40 |
| > $15.00 | 0.0005 | 0.45 |

---

## 🌍 Initial Countries

| ID | Country | Supply | Initial Price |
|----|---------|--------|---------------|
| 90 | Turkey (🇹🇷) | 50,000 | 5.00 USDC |
| 44 | United Kingdom (🇬🇧) | 50,000 | 5.00 USDC |
| 1 | United States (🇺🇸) | 50,000 | 5.00 USDC |

**Seeding Transactions**:
- Turkey: `0x636efd72bfb17f86c70106603944848061782a2dd949afd75663d2e71508f691`
- UK: `0x2284e9fb1275766ef5e8c753cb536c4ae75ababde87ef478661545ab4b76ae30`
- US: `0xa4bd005b6698a4d00230a17f452fbdedb4a96cf47e5353576f1cf0f4e21b0d3c`

---

## 🔐 Security Features

### Attack System
✅ **ERC20-only fees** (USDC or configurable feeToken)  
✅ **Tier-based pricing** with snapshotted values (no drift in batch)  
✅ **On-chain rate limits** with per-target bucket reset  
✅ **2-phase batch atomicity** (fee-first, then state updates)  
✅ **Ownership validation** (user must own attacker country tokens)  
✅ **Floor guard** (target price never goes below minimum)

### Trading System
✅ **Arithmetic series pricing** for multi-token trades  
✅ **USDC delta proof** (balance verification for buy/sell)  
✅ **Slippage protection** (2% default)  
✅ **Transaction deadlines** (5 minutes)  
✅ **Soulbound tokens** (non-transferable country tokens)  
✅ **Reentrancy guards** on all state-changing functions

---

## 🚀 Frontend Integration

### Environment Variables
```env
NEXT_PUBLIC_CORE_ADDRESS=0xBe9941784f3B7Fe6eF670E65c988719709bAcD0e
NEXT_PUBLIC_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_RPC_BASE_SEPOLIA=https://sepolia.base.org
```

### Required Approvals
Users must approve the Core contract for:
1. **USDC** - For buy/sell trades and attack fees (when `attackFeeInUSDC=true`)
2. **Fee Token** - For attack fees (when `attackFeeInUSDC=false`, currently unused)

---

## 📊 Contract Spec Compliance

| Feature | Status |
|---------|--------|
| Tier-based attack fees | ✅ |
| On-chain rate limits | ✅ |
| Batch attack (max 5) | ✅ |
| ERC20-only fees | ✅ |
| Per-target bucket reset | ✅ |
| Fee-first atomicity | ✅ |
| Tier snapshot (no drift) | ✅ |
| Ownership validation | ✅ |
| Floor guard | ✅ |
| USDC delta proof | ✅ |
| Arithmetic series pricing | ✅ |

---

## 📝 Notes

- Contract starts paused and was manually unpaused after deployment
- All country tokens are soulbound (non-transferable)
- Attack fees currently use USDC (6 decimals)
- Alternative fee token support is implemented but not activated
- Batch UI is pending implementation (contract ready)

---

## 🔗 Explorer Links

- **Contract**: https://sepolia.basescan.org/address/0xBe9941784f3B7Fe6eF670E65c988719709bAcD0e
- **USDC**: https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e
- **Deployer**: https://sepolia.basescan.org/address/0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82

