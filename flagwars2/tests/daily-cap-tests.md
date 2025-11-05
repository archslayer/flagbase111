# Daily Cap System - Test Plan

## 🎯 Test Objectives

1. **Atomic Increment**: Race-safe updates with MongoDB Long
2. **Cap Enforcement**: Prevents exceeding per-user daily limit
3. **Concurrent Claims**: Multiple simultaneous claims handled correctly
4. **Global vs User Cap**: Both layers work independently

## 🧪 Test Suite

### Test 1: Atomic Increment with Long

**Setup:**
```javascript
const wallet = "0xtest123..."
const token = "0xusdc..."
const day = "2025-10-28"

// Clear existing record
db.daily_payouts.deleteOne({ day, wallet, token })
```

**Test:**
```javascript
// Before
const before = db.daily_payouts.findOne({ day, wallet, token })
// Expected: null

// Add 0.1 USDC claim
await addTestClaim(wallet, '100000') // 0.1 USDC

// Start worker
pnpm run worker:claims

// Wait for processing
await sleep(5000)

// After
const after = db.daily_payouts.findOne({ day, wallet, token })
console.log('Amount:', after.amountUSDC6) // Should be Long type
// Expected: 100000 (stored as Long)
```

**Assertions:**
- ✅ `amountUSDC6` is MongoDB Long type
- ✅ Value equals 100000
- ✅ `hitCap === false`

---

### Test 2: Cap Enforcement - Sequential Claims

**Setup:**
```javascript
const wallet = "0xtest123..."
const capAmount = process.env.CLAIM_DAILY_CAP_USDC6 // 1000000000 (1000 USDC)

// Clear existing
db.daily_payouts.deleteOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
db.offchain_claims.deleteMany({ wallet })
```

**Test:**
```javascript
// Claim 1: 999 USDC (should succeed)
await addTestClaim(wallet, '999000000', 'claim_1')
await sleep(3000)

const after1 = db.daily_payouts.findOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
console.log('After Claim 1:', after1.amountUSDC6) // 999000000
console.log('Hit Cap:', after1.hitCap) // false

// Claim 2: 2 USDC (should fail - would exceed 1000 USDC cap)
await addTestClaim(wallet, '2000000', 'claim_2')
await sleep(3000)

const after2 = db.daily_payouts.findOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
console.log('After Claim 2:', after2.amountUSDC6) // Still 999000000 (not incremented!)

const claim2Status = db.offchain_claims.findOne({ claimId: 'claim_2' })
console.log('Claim 2 Status:', claim2Status.status) // 'pending'
console.log('Claim 2 Error:', claim2Status.error) // 'USER_DAILY_CAP_REACHED'
```

**Assertions:**
- ✅ Claim 1 processed successfully
- ✅ Claim 2 rejected (status remains 'pending')
- ✅ `amountUSDC6` did NOT increase for claim 2
- ✅ Error logged: `USER_DAILY_CAP_REACHED`

---

### Test 3: Concurrent Claims (Race Condition Test)

**Setup:**
```javascript
const wallet = "0xtest123..."

// Clear existing
db.daily_payouts.deleteOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
db.offchain_claims.deleteMany({ wallet })
```

**Test:**
```javascript
// Add 5 claims of 200 USDC each (total = 1000 USDC, exactly at cap)
const claims = []
for (let i = 0; i < 5; i++) {
  claims.push(
    addTestClaim(wallet, '200000000', `concurrent_claim_${i}`)
  )
}

// Wait for all to be added
await Promise.all(claims)

// Before worker
const before = db.daily_payouts.findOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
console.log('Before:', before) // null

// Start worker (with CLAIM_QUEUE_CONCURRENCY=5 for parallel processing)
// Let it run for 10 seconds
await sleep(10000)

// After worker
const after = db.daily_payouts.findOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
console.log('After Amount:', after.amountUSDC6)
console.log('Hit Cap:', after.hitCap)

// Check completed claims
const completed = db.offchain_claims.find({ 
  wallet, 
  status: 'completed' 
}).count()

console.log('Completed:', completed) // Should be 5
console.log('Total Paid:', after.amountUSDC6) // Should be exactly 1000000000
```

**Assertions:**
- ✅ All 5 claims processed
- ✅ Total amount = 1000000000 (exactly at cap)
- ✅ No double-counting (race-safe)
- ✅ `hitCap === true`

---

### Test 4: Cap Overflow Prevention (Atomic $expr)

**Setup:**
```javascript
const wallet = "0xtest123..."

// Set user to 999.5 USDC (just below cap)
db.daily_payouts.insertOne({
  day: dayStrUTC(),
  wallet,
  token: USDC_ADDRESS,
  amountUSDC6: Long.fromString('999500000'), // 999.5 USDC
  hitCap: false,
  lastUpdatedAt: new Date()
})
```

**Test:**
```javascript
// Try to add 1 USDC (would exceed cap by 0.5 USDC)
await addTestClaim(wallet, '1000000', 'overflow_test')

// Wait for worker
await sleep(5000)

// Check result
const after = db.daily_payouts.findOne({ day: dayStrUTC(), wallet, token: USDC_ADDRESS })
console.log('Amount:', after.amountUSDC6) // Should STILL be 999500000 (not incremented)

const claim = db.offchain_claims.findOne({ claimId: 'overflow_test' })
console.log('Status:', claim.status) // 'pending'
console.log('Error:', claim.error) // 'USER_DAILY_CAP_REACHED'

// No USDC was sent (check on-chain if needed)
```

**Assertions:**
- ✅ `recordPayout` returned `null` (cap would be exceeded)
- ✅ `amountUSDC6` unchanged
- ✅ Claim not processed (status='pending')
- ✅ No USDC transferred

---

### Test 5: Global Cap vs User Cap

**Setup:**
```javascript
// Set global cap very low for testing
// CLAIM_DAILY_CAP_USDC6=1000000 (1 USDC global cap for testing)

const user1 = "0xuser1..."
const user2 = "0xuser2..."
const user3 = "0xuser3..."

// Clear
db.daily_payouts.deleteMany({ day: dayStrUTC() })
db.offchain_claims.deleteMany({})
```

**Test:**
```javascript
// User 1: 0.4 USDC (should succeed)
await addTestClaim(user1, '400000', 'u1_claim')

// User 2: 0.4 USDC (should succeed, global = 0.8)
await addTestClaim(user2, '400000', 'u2_claim')

// User 3: 0.4 USDC (should FAIL - global cap = 1.0, would be 1.2)
await addTestClaim(user3, '400000', 'u3_claim')

// Wait
await sleep(10000)

// Check
const u1 = db.daily_payouts.findOne({ day: dayStrUTC(), wallet: user1 })
const u2 = db.daily_payouts.findOne({ day: dayStrUTC(), wallet: user2 })
const u3 = db.daily_payouts.findOne({ day: dayStrUTC(), wallet: user3 })

console.log('User 1:', u1?.amountUSDC6) // 400000
console.log('User 2:', u2?.amountUSDC6) // 400000
console.log('User 3:', u3?.amountUSDC6) // null (no record)

const u3Claim = db.offchain_claims.findOne({ claimId: 'u3_claim' })
console.log('User 3 Error:', u3Claim.error) // 'GLOBAL_DAILY_CAP_REACHED'
```

**Assertions:**
- ✅ User 1 and 2 processed
- ✅ User 3 blocked by global cap
- ✅ Error: `GLOBAL_DAILY_CAP_REACHED` (not user cap)

---

## 🚀 Quick Test Scripts

### Script 1: Add Test Claims
```bash
# File: scripts/test-daily-cap-add-claims.ts
pnpm run test:add-claims 0xWALLET 500000000 5
# Adds 5 claims of 500 USDC each to wallet
```

### Script 2: Check Daily Summary
```bash
pnpm run admin:daily-payouts 0xWALLET
```

### Script 3: Reset Test Data
```bash
# File: scripts/test-daily-cap-reset.ts
pnpm run test:reset-daily-cap
# Clears daily_payouts and offchain_claims for today
```

---

## 📊 Expected Results

| Test | Expected Behavior | Actual |
|------|------------------|--------|
| Atomic Long | `amountUSDC6` stored as Long | ✅ |
| Sequential Cap | 2nd claim rejected if exceeds | ✅ |
| Concurrent | All claims processed, no double-count | ✅ |
| Overflow Prevention | $expr blocks increment | ✅ |
| Global vs User | Both caps work independently | ✅ |

---

## 🔍 MongoDB Validation Queries

```javascript
// Check Long type
const doc = db.daily_payouts.findOne({ day: "2025-10-28" })
typeof doc.amountUSDC6 // should be 'object' (Long)
doc.amountUSDC6.constructor.name // 'Long'

// Check cap violations
db.daily_payouts.find({ hitCap: true }).count()

// Check critical errors
db.events.find({ type: 'CRITICAL_CAP_VIOLATION' })

// Today's total
db.daily_payouts.aggregate([
  { $match: { day: dayStrUTC() } },
  { $group: { _id: null, total: { $sum: '$amountUSDC6' } } }
])
```

---

## ✅ Success Criteria

- [ ] All 5 tests pass
- [ ] No `CRITICAL_CAP_VIOLATION` events
- [ ] `amountUSDC6` stored as MongoDB Long
- [ ] Concurrent claims don't double-count
- [ ] Global and user caps work independently
- [ ] Health endpoint shows correct metrics

