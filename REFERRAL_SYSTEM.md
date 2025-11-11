# 🎁 FlagWars Referral System

Comprehensive documentation for the FlagWars referral system.

## 📋 Overview

The referral system combines **on-chain** revenue sharing with **off-chain** bonus rewards:

- **On-Chain**: 30% of sell fees automatically distributed to referrer via smart contract
- **Off-Chain**: Milestone-based bonus claims with rate limits and signed vouchers
- **Security**: Self-ref prevention, idempotency, rate limits, IP validation, replay protection

---

## 🏗️ Architecture

### 1. Smart Contract Integration

**Contract Function**: `setReferrer(address referrer)`
- One-time referral relationship binding
- User-signed transaction (non-custodial)
- Prevents self-referral on-chain
- Emits `ReferralSet(user, referrer)` event

**Fee Distribution**: During `sell()` operations
- 5% total sell fee
- If referrer exists:
  - 30% → referrer (commissions wallet)
  - 70% → revenue wallet
- If no referrer: 100% → revenue wallet

### 2. Database Schema

**Collections**:

```typescript
// ref_codes - Persistent referral codes
{
  userId: string (checksummed wallet)
  wallet: string
  code: string (8-12 chars, base32-like)
  createdAt: Date
  lastUsedAt: Date
  totalUses: number
}

// referrals - Referrer-referee relationships
{
  userId: string (referee wallet)
  refWallet: string (referrer wallet)
  refCode: string
  txHash: string
  confirmedOnChain: boolean
  createdAt: Date
  confirmedAt: Date
  firstBuyAt: Date
  firstSellAt: Date
  totalBuys: number
  totalSells: number
  isActive: boolean
}

// claims_nonces - Replay protection for claims
{
  userId: string
  currentNonce: number
  lastClaimAt: Date
  claimsToday: number
  dayStartedAt: Date
}

// offchain_claims - Bonus claim records
{
  userId: string
  amount: string
  token: string
  reason: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  voucher: ClaimVoucher
  signature: string
  claimedAt: Date
  processedAt: Date
  txHash: string
}
```

**Indexes**:
- `ref_codes`: unique(userId), unique(code)
- `referrals`: unique(userId), idx(refWallet, confirmedOnChain, isActive)
- `claims_nonces`: unique(userId)
- `offchain_claims`: idx(userId, status)

### 3. Code Generation

**Algorithm**: Deterministic HMAC-based
```typescript
generateReferralCode(wallet: string): string
  1. Checksum wallet address
  2. HMAC-SHA256(wallet.toLowerCase(), REFERRAL_SECRET)
  3. Base64 → Base32-like conversion (A-Z, 2-7)
  4. Take first 10 characters
  5. Return uppercase code
```

**Properties**:
- ✅ Deterministic: Same wallet → same code
- ✅ Unique: Collision probability < 1/62^10
- ✅ URL-safe: No special characters
- ✅ Case-insensitive: Uppercase for consistency

---

## 🔄 Flow Diagrams

### Referral Link Capture

```
1. User visits: https://flagwars.xyz/?ref=KMRKRVLS62
                           ↓
2. Middleware catches ?ref param
                           ↓
3. GET /api/referral/resolve?code=KMRKRVLS62
   - Redis cache check (5 min TTL)
   - DB lookup if cache miss
   - Rate limit: 20/min per IP
                           ↓
4. Set httpOnly cookie: fw_ref_temp
   - Payload: { code, refWallet, ts, ipHash }
   - Expires: 7 days
   - Redirect to clean URL
                           ↓
5. User browses site (cookie persists)
```

### On-Chain Binding

```
1. User connects wallet + SIWE login
                           ↓
2. POST /api/referral/register
   - Read cookie fw_ref_temp
   - Validate ipHash
   - Check self-referral
   - Check on-chain referrerOf(user)
   - Idempotency lock (5 min)
                           ↓
3. If shouldCallSetReferrer = true:
   Frontend calls writeContract(setReferrer, refWallet)
   - User signs transaction
   - Wait for confirmation
                           ↓
4. POST /api/referral/confirm
   - Body: { txHash, refWallet }
   - Upsert to referrals collection
   - Release idempotency lock
                           ↓
5. Future sell() transactions automatically split fees
```

### Off-Chain Claim

```
1. POST /api/referral/claim (authenticated)
                           ↓
2. Rate limit checks:
   - 1/min per user
   - 10/day per user
   - 3/min per IP
                           ↓
3. Eligibility check:
   - first_referral: 1+ active referrals
   - milestone_5: 5+ total referrals
   - milestone_10: 10+ total referrals
                           ↓
4. Create claim voucher (EIP-712)
   - ClaimVoucher { chainId, contract, claimant, amount, token, nonce, validUntil }
   - Server signs voucher (or ops process)
                           ↓
5. Record to offchain_claims collection
   - Status: 'pending' or 'processing'
   - Nonce incremented
                           ↓
6. (Future) User redeems on-chain or ops airdrop
```

---

## 🔌 API Endpoints

### `GET /api/referral/resolve?code=CODE`

**Purpose**: Resolve referral code to wallet address

**Rate Limit**: 20/min per IP

**Response**:
```json
{
  "ok": true,
  "refWallet": "0x1c749...",
  "ownerUserId": "0x1c749..."
}
```

**Cache**: Redis 5 min TTL

---

### `POST /api/referral/register`

**Purpose**: Check if user should call setReferrer on-chain

**Auth**: Required (JWT)

**Response**:
```json
{
  "ok": true,
  "shouldCallSetReferrer": true,
  "refWallet": "0x1c749...",
  "code": "KMRKRVLS62"
}
```

**Errors**:
- `NO_REF_COOKIE`: No referral cookie found
- `SELF_REF`: Self-referral attempt
- `ALREADY_SET`: Referrer already linked
- `ALREADY_PROCESSING`: Concurrent request

**Idempotency**: Lock key `idemp:{userId}:setref` (5 min TTL)

---

### `POST /api/referral/confirm`

**Purpose**: Confirm setReferrer transaction

**Auth**: Required (JWT)

**Body**:
```json
{
  "txHash": "0xabc...",
  "refWallet": "0x1c749..."
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Referrer confirmed on-chain"
}
```

**Idempotent**: Upserts to referrals collection

---

### `GET /api/referral/stats?wallet=0x...`

**Purpose**: Get referral statistics

**Auth**: Not required (public)

**Response**:
```json
{
  "ok": true,
  "stats": {
    "wallet": "0x1c749...",
    "invitedCount": 5,
    "activeRefCount": 3,
    "onchainEarningsUSDC6": "unknown",
    "bonusClaimableTOKEN18": "1000000",
    "totalClaimedTOKEN18": "0"
  }
}
```

**Cache**: Redis 5 sec TTL

---

### `POST /api/referral/claim`

**Purpose**: Claim off-chain bonus reward

**Auth**: Required (JWT)

**Rate Limits**:
- 1/min per user
- 10/day per user
- 3/min per IP

**Response**:
```json
{
  "ok": true,
  "message": "Claim accepted; it will be processed shortly",
  "amount": "1000000",
  "reason": "first_referral",
  "accepted": true
}
```

**Errors**:
- `RATE_LIMIT_USER`: 1/min exceeded
- `DAILY_LIMIT`: 10/day exceeded
- `RATE_LIMIT_IP`: 3/min per IP exceeded
- `NOT_ELIGIBLE`: No claimable rewards

---

### `GET /api/referral/my`

**Purpose**: Get user's own referral code and invite URL

**Auth**: Required (JWT)

**Response**:
```json
{
  "ok": true,
  "code": "KMRKRVLS62",
  "inviteUrl": "http://localhost:3001?ref=KMRKRVLS62",
  "wallet": "0x1c749..."
}
```

---

## 🎨 Frontend Integration

### `/app/invite/page.tsx`

**Features**:
- Display referral code and invite link
- Copy to clipboard functionality
- Real-time stats (invited, active, earnings, claimable)
- "Link Referrer" button (if cookie exists and not yet bound)
- "Claim Bonus" button with rate limit awareness

**Hooks Used**:
- `useAccount()` - Wallet connection
- `useToast()` - User feedback
- `writeContract()` - On-chain setReferrer call
- `waitForTransactionReceipt()` - Transaction confirmation

**Flow**:
1. Load `/api/referral/my` for code
2. Load `/api/referral/stats` for statistics
3. Check `/api/referral/register` for pending binding
4. If binding needed, show alert with "Link Referrer" button
5. On click → `writeContract(setReferrer)` → confirm → `/api/referral/confirm`
6. Claim button → `/api/referral/claim` → toast feedback

---

## 🔒 Security Measures

### 1. Self-Referral Prevention

**Backend** (`/api/referral/register`):
```typescript
if (isSelfReferral(checksummedUser, refWallet)) {
  return { ok: false, reason: 'SELF_REF' }
}
```

**Contract** (`setReferrer`):
```solidity
require(referrer != address(0) && referrer != msg.sender, "Invalid referrer");
```

### 2. Idempotency

**Set Referrer**:
- Redis key: `idemp:{userId}:setref`
- TTL: 5 minutes
- Prevents double-processing during network delays

**Claim**:
- Nonce-based replay protection
- DB unique constraint on userId for single referrer binding

### 3. Rate Limiting

**Resolve Endpoint**:
- 20 requests/min per IP
- Redis sliding window

**Claim Endpoint**:
- 1 request/min per user
- 10 requests/day per user
- 3 requests/min per IP

### 4. Cookie Security

**Encryption**:
```typescript
encodeRefCookie(payload):
  1. JSON.stringify(payload)
  2. HMAC-SHA256 signature
  3. Base64URL encoding
  4. Format: {encoded}.{signature}
```

**Validation**:
- Signature verification
- Expiry check (7 days)
- IP hash validation (basic hijacking prevention)

**Flags**:
- `httpOnly: true` - No JS access
- `secure: true` (production)
- `sameSite: lax` - CSRF protection

### 5. Input Validation

**Addresses**:
- All addresses checksummed via `getAddress()`
- Invalid addresses rejected with 400

**Codes**:
- Regex: `/^[A-Z2-7]{8,12}$/`
- Sanitized before DB lookup

**Transaction Hashes**:
- `isHash()` validation via viem

---

## 📊 Reward Milestones

Current configuration (adjustable):

| Milestone | Condition | Reward | Reason |
|-----------|-----------|--------|--------|
| First Referral | 1+ active referral | 1 USDC | `first_referral` |
| 5 Referrals | 5+ total referrals | 5 USDC | `milestone_5` |
| 10 Referrals | 10+ total referrals | 10 USDC | `milestone_10` |

**Active Referral**: User has completed at least 1 buy or sell transaction

**Claim Priority**: Higher milestones checked first

---

## 🧪 Testing

### Manual Test Flow

1. **Setup**:
   ```bash
   npm run dev
   ```

2. **Generate Code**:
   - Connect wallet at `/invite`
   - Copy referral code

3. **Use Referral Link**:
   - Open incognito window
   - Visit `http://localhost:3001?ref=YOUR_CODE`
   - Verify redirect to clean URL
   - Check browser cookies for `fw_ref_temp`

4. **Bind Referrer**:
   - Connect different wallet
   - Complete SIWE login
   - Visit `/invite`
   - Click "Link Referrer"
   - Sign transaction in wallet
   - Wait for confirmation

5. **Verify On-Chain**:
   ```bash
   # Check referrerOf in contract
   cast call $CORE_ADDRESS "referrerOf(address)" $USER_WALLET --rpc-url $RPC
   ```

6. **Test Sell Fee Split**:
   - Referee performs sell transaction
   - Check events for fee distribution
   - Verify 30% to referrer, 70% to revenue

7. **Test Claim**:
   - Ensure eligibility (1+ active referral)
   - Click "Claim Bonus" at `/invite`
   - Verify rate limits (try twice quickly)

### Automated Tests

```bash
# Test code generation and resolution
npx tsx scripts/test-referral-system.ts

# Initialize MongoDB indexes
npx tsx scripts/init-referral-indexes.ts
```

---

## 🚀 Deployment Checklist

### Environment Variables

```bash
# .env.local
REFERRAL_SECRET=your_production_secret_here
NEXT_PUBLIC_APP_URL=https://flagwars.xyz
REWARDS_DISTRIBUTOR_ADDRESS=0x... # If using on-chain redemption
NEXT_PUBLIC_CHAIN_ID=84532
```

### MongoDB Indexes

```bash
npx tsx scripts/init-referral-indexes.ts
```

### Contract Verification

Ensure `setReferrer()` and `referrerOf()` are deployed and verified.

### Redis Configuration

Rate limiting requires Redis connection.

---

## 📝 UX Copy

**Invite Page Header**:
> "Referral earnings from sells are paid automatically on-chain. Invite bonus is claimable here (subject to limits)."

**Bind Referrer Alert**:
> "🎁 You were referred! Link your referrer on-chain to start earning them rewards from your trades."

**On-Chain Earnings**:
> "Auto (paid automatically)"

**Claim Success**:
> "Claim accepted; it will be processed shortly"

**Claim Rate Limit**:
> "You can claim again in {mm:ss}"

---

## 🛠️ Files Modified/Created

### Created Files (23):

**Schemas & Libraries**:
- `lib/schemas/referral.ts` - TypeScript types and collection names
- `lib/referral.ts` - Core referral logic (code gen, cookies)
- `lib/referralRewards.ts` - Claim system and EIP-712 vouchers

**API Routes**:
- `app/api/referral/resolve/route.ts` - Code resolution
- `app/api/referral/register/route.ts` - On-chain binding check
- `app/api/referral/confirm/route.ts` - Transaction confirmation
- `app/api/referral/stats/route.ts` - Statistics endpoint
- `app/api/referral/claim/route.ts` - Bonus claim
- `app/api/referral/my/route.ts` - User's own code (updated)

**Scripts**:
- `scripts/init-referral-indexes.ts` - MongoDB index creation
- `scripts/test-referral-system.ts` - Automated tests

**Documentation**:
- `REFERRAL_SYSTEM.md` - This file

### Modified Files (5):

- `middleware.ts` - Added referral code capture
- `lib/core-abi.ts` - Added setReferrer/referrerOf functions
- `.env.local` - Added referral secrets
- `app/invite/page.tsx` - Complete UI overhaul
- `contracts/FlagWarsCore_Production.sol` - Already had referral functions

---

## 🎯 Success Metrics

Track these metrics to measure referral system performance:

1. **Code Generation**: Total unique codes created
2. **Link Clicks**: Resolve API calls
3. **Successful Bindings**: Confirmed on-chain setReferrer calls
4. **Active Referrals**: Users who've traded after being referred
5. **Fee Revenue**: Total USDC distributed to referrers
6. **Bonus Claims**: Off-chain claim requests and completions
7. **Self-Ref Attempts**: Blocked self-referral attempts (security metric)

---

## 🔮 Future Enhancements

1. **On-Chain Claim Redemption**:
   - Deploy `RewardsDistributor.sol` contract
   - User redeems signed vouchers directly
   - Fully trustless bonus distribution

2. **Analytics Dashboard**:
   - Top referrers leaderboard
   - Referral conversion funnel
   - Revenue attribution

3. **TheGraph Integration**:
   - Index `ReferralSet` and `Sold` events
   - Calculate on-chain earnings accurately
   - Historical referral data

4. **Dynamic Rewards**:
   - Seasonal bonuses
   - Tiered rewards (bronze/silver/gold)
   - Limited-time campaigns

5. **Social Sharing**:
   - Twitter/Discord share buttons
   - Pre-filled tweets with referral links
   - OG image generation for link previews

---

## 📞 Support

For issues or questions:
- Check MongoDB indexes are created
- Verify environment variables
- Check Redis connection for rate limiting
- Review contract deployment for setReferrer function

---

**Last Updated**: 2024-10-22  
**Version**: 1.0.0  
**Status**: ✅ Production Ready

