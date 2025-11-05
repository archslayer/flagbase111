# Referral & Rewards System - Complete Report

## 📊 System Overview

FlagWars has **TWO SEPARATE reward systems**:

### 1. **On-Chain Referral System** (Real-time, automatic)
### 2. **Off-Chain Milestone Rewards** (Manual claim required)

---

## 🎯 System 1: On-Chain Referral System (LIVE)

### How It Works

When a user trades (buy/sell) with a referral link:

```
User A invites User B (referral link: ?ref=CODE)
  ↓
User B connects wallet → Cookie set (fw_ref=CODE)
  ↓
User B makes first trade → setReferrer() called on-chain
  ↓
User B continues trading → 30% of sell fees → User A (automatic!)
```

### Revenue Split (On-Chain)

**For REFERRED users' trades:**
- **30% → Referrer** (automatic, on-chain)
- **70% → Treasury**

**For NON-REFERRED users' trades:**
- **100% → Treasury**

### Key Points

✅ **Automatic**: No claim button needed
✅ **Real-time**: Instant USDC to referrer on each trade
✅ **On-Chain**: Tracked in smart contract
✅ **No Rate Limit**: Every trade pays immediately

### Database Collections

- `referrals`: Tracks referrer-referree relationships
- `wallet_stats_daily`: Daily trading volume per wallet
- `tx_events`: All trade events for analytics

---

## 🏆 System 2: Off-Chain Milestone Rewards (NOT IMPLEMENTED YET)

### What Are Milestones?

Milestones are **bonus rewards** for reaching referral goals:

```
Milestone 1: First referral → 1 USDC bonus
Milestone 5: 5 active referrals → 5 USDC bonus
Milestone 10: 10 active referrals → 10 USDC bonus
```

### How It SHOULD Work (Design)

```
User reaches milestone (e.g., 5 referrals)
  ↓
Backend detects milestone completion
  ↓
User sees "Claim Rewards" button (e.g., "You have 5 USDC to claim!")
  ↓
User clicks "Claim Rewards"
  ↓
Rate limit check (1/min, 10/day)
  ↓
If OK: Create offchain_claim (pending)
  ↓
Worker processes claim
  ↓
USDC sent to wallet
```

### Current Status

❌ **NOT IMPLEMENTED**: Milestone detection logic doesn't exist
❌ **NOT INTEGRATED**: UI doesn't show milestone progress
❌ **ONLY TESTED**: Manual DB insertion for testing

### Database Collections

- `offchain_claims`: Pending/completed claims
- `daily_payouts`: Daily cap tracking per user
- `claim_nonces`: Rate limit tracking

---

## 🔄 Claim Flow (For Milestone Rewards)

### Step 1: User Earns Milestone

```typescript
// Backend should detect:
const referrals = await db.collection('referrals').find({
  refWallet: userWallet,
  confirmedOnChain: true,
  isActive: true
}).toArray()

if (referrals.length === 5) {
  // User reached milestone 5!
  // Mark as "claimable" in pending_rewards
}
```

### Step 2: User Sees Claimable Amount

```typescript
// GET /api/referral/preview
{
  pendingAmountUSDC6: "5000000", // 5 USDC
  reason: "milestone_5",
  eligible: true
}
```

### Step 3: User Clicks Claim

```typescript
// POST /api/referral/claim
// Rate limits:
// - 1 claim per minute (per user)
// - 10 claims per day (per user)
// - 3 claims per minute (per IP)

if (rateLimit.allowed) {
  const claim = {
    wallet: userWallet,
    amount: "5000000",
    token: USDC_ADDRESS,
    reason: "milestone_5",
    claimId: "milestone_5:userId",
    status: "pending",
    idempoKey: keccak256(...),
    claimedAt: new Date()
  }
  
  await db.collection('offchain_claims').insertOne(claim)
}
```

### Step 4: Worker Processes

```typescript
// Worker polls offchain_claims for status='pending'
const claims = await db.collection('offchain_claims')
  .find({ status: 'pending' })
  .sort({ claimedAt: 1 })
  .limit(BATCH_SIZE)

for (const claim of claims) {
  // Check daily cap (per user)
  const canProcess = await canUserReceivePayout(...)
  
  if (canProcess) {
    // Send USDC
    const txHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [claim.wallet, BigInt(claim.amount)]
    })
    
    // Mark as completed
    await db.collection('offchain_claims').updateOne(
      { _id: claim._id },
      { $set: { status: 'completed', txHash, processedAt: new Date() }}
    )
    
    // Track daily payout
    await recordPayout(claim.wallet, claim.amount)
  }
}
```

---

## 🚫 What's NOT Implemented

### 1. Milestone Detection

**Missing:** Automatic detection when user reaches milestone

**Needs:**
- Background job to check referral counts
- Update `pending_rewards` collection when milestone reached
- Notify user in UI

### 2. Pending Rewards Tracking

**Missing:** `pending_rewards` collection not integrated

**Current State:**
- `offchain_claims` exists (for claims)
- But nothing populates it except manual testing

**Should Be:**
```typescript
// When user reaches milestone:
await db.collection('pending_rewards').insertOne({
  wallet: userWallet,
  amountUSDC6: 5000000,
  reason: 'milestone_5',
  createdAt: new Date(),
  claimed: false
})

// When user claims:
// 1. Check pending_rewards
// 2. If exists, create offchain_claim
// 3. Mark pending_reward as claimed
```

### 3. UI Integration

**Missing:**
- Milestone progress display (e.g., "3/5 referrals")
- Pending rewards display (e.g., "You have 5 USDC to claim!")
- Claim button only shows if `pending_rewards > 0`

**Current State:**
- Claim button always visible
- No visual feedback on milestone progress

---

## 📝 Achievements vs Milestones

### Achievements System (Separate!)

**Achievements** are **on-chain NFTs** (SBTs - Soulbound Tokens):

- First Trade
- First Attack
- Volume milestones
- Attack streak records

**Tracked in:** `achievements` collection + `AchievementsSBT` smart contract

### Milestones System (Off-Chain Rewards)

**Milestones** are **USDC bonuses** for referral goals:

- Not NFTs
- Just cash rewards
- Claimed via `/api/referral/claim`

### Key Difference

| Feature | Achievements | Milestones |
|---------|--------------|------------|
| Type | NFT (SBT) | USDC Bonus |
| Trigger | Trading/Attack | Referral Count |
| Claim | Automatic | Manual Button |
| On-Chain | Yes | No (off-chain claim) |
| Contract | AchievementsSBT.sol | None |

---

## 🛠️ How to Fix & Complete System

### Option A: Simple Fix (Recommended)

**Remove milestone rewards entirely. Keep only on-chain referral system.**

✅ Pros:
- Already works
- No complexity
- Real-time payments
- No rate limits needed

❌ Cons:
- No bonus incentives

### Option B: Implement Milestones (Complex)

**Add milestone detection and pending rewards tracking.**

Required Changes:

1. **Backend Job** (`workers/milestone-detector.worker.ts`)
   ```typescript
   // Run every 5 minutes
   // Check all users' referral counts
   // If milestone reached, add to pending_rewards
   ```

2. **Update Claim API** (`app/api/referral/claim/route.ts`)
   ```typescript
   // Check pending_rewards collection
   // If user has pending rewards:
   //   - Create offchain_claim
   //   - Mark pending_reward as claimed
   ```

3. **Update Preview API** (`app/api/referral/preview/route.ts`)
   ```typescript
   // Return pending_rewards amount
   ```

4. **Update UI** (`app/invite/page.tsx`)
   ```typescript
   // Show milestone progress
   // Show pending rewards amount
   // Enable/disable claim button based on pending rewards
   ```

---

## 📊 Current Database State

### Collections in Use

1. **`referrals`** - Referrer-referree links (on-chain)
2. **`wallet_stats_daily`** - Trading volume per wallet
3. **`tx_events`** - All trade/attack events
4. **`offchain_claims`** - Pending/completed claims (milestone system)
5. **`daily_payouts`** - Daily cap tracking (milestone system)
6. **`claim_nonces`** - Rate limit tracking (milestone system)

### What Works

✅ On-chain referral (30% of sell fees → referrer)
✅ Claim worker (processes offchain_claims)
✅ Rate limits (1/min, 10/day)
✅ Daily cap (1000 USDC per user per day)
✅ Idempotency (keccak256 keys)
✅ Nonce management (sequential transactions)

### What Doesn't Work

❌ Milestone detection (no logic to detect)
❌ Pending rewards tracking (collection exists but unused)
❌ UI milestone display (not integrated)
❌ Automatic reward population (only manual testing)

---

## 🎯 Recommendation

**Keep it simple:**

1. **Remove milestone system** (not implemented)
2. **Keep on-chain referral** (works perfectly)
3. **Remove claim button** (not needed if no milestones)
4. **Update UI** to show:
   - "Referral earnings: X USDC (paid automatically)"
   - No claim button
   - Just stats display

OR

**Implement milestones properly** (requires work):
- Add milestone detection worker
- Integrate pending_rewards
- Update UI
- Test thoroughly

---

## 🔍 Testing Current System

### To Test On-Chain Referral (Works Now)

1. User A creates referral code
2. User B uses referral link
3. User B makes first trade (setReferrer called)
4. User B continues trading
5. **30% of User B's sell fees → User A (automatic!)**

### To Test Milestone System (Needs Manual Setup)

```bash
# Add fake claimable reward
npx tsx scripts/add-claimable-balance.ts

# This adds entry to pending_rewards
# But claim API doesn't check it yet!
# Need to update claim API to read pending_rewards
```

---

## ✅ Summary

| System | Status | Works? | Needs |
|--------|--------|--------|-------|
| On-Chain Referral | ✅ Live | Yes | Nothing |
| Milestone Rewards | ❌ Partial | No | Full implementation |
| Claim Worker | ✅ Ready | Yes | Milestone integration |
| Rate Limits | ✅ Ready | Yes | Nothing |
| Daily Caps | ✅ Ready | Yes | Nothing |
| UI Display | ⚠️ Partial | Partial | Milestone progress |

**Bottom Line:** On-chain referral works. Milestone system is incomplete. Either remove it or implement it properly.

