import 'server-only'
import { ObjectId } from 'mongodb'

/**
 * Referral Codes Collection
 * Stores persistent referral codes for each user
 */
export interface RefCode {
  _id?: ObjectId
  userId: string          // User's wallet address (checksummed)
  wallet: string          // Same as userId (for clarity)
  code: string            // 8-12 char base32-like code (unique, case-insensitive)
  createdAt: Date
  lastUsedAt?: Date       // Last time someone used this code
  totalUses: number       // How many times this code was used
}

/**
 * Referrals Collection
 * Tracks referrer-referee relationships
 */
export interface Referral {
  _id?: ObjectId
  userId: string          // Referee's wallet (checksummed)
  wallet: string          // Same as userId
  walletLower: string     // Lowercase for case-insensitive queries
  refWallet: string       // Referrer's wallet (checksummed)
  refWalletLower: string  // Lowercase for case-insensitive queries
  refCode: string         // The code that was used
  txHash?: string         // setReferrer transaction hash
  confirmedOnChain: boolean
  createdAt: Date
  confirmedAt?: Date      // When tx was confirmed
  
  // Activity tracking
  firstBuyAt?: Date
  firstSellAt?: Date
  totalBuys: number
  totalSells: number
  isActive: boolean       // Has done at least 1 buy or sell
}

/**
 * Referral Cookie Payload
 */
export interface RefCookiePayload {
  code: string
  refWallet: string
  ts: number              // Timestamp
  ipHash: string          // SHA256(clientIP + userAgent + salt)
  exp: number             // Expiry timestamp
}

/**
 * Claims Nonces Collection
 * Prevents replay attacks for off-chain claims
 */
export interface ClaimNonce {
  _id?: ObjectId
  userId: string          // Wallet address
  currentNonce: number
  lastClaimAt?: Date
  claimsToday: number
  dayStartedAt: Date
}

/**
 * Claim Voucher (EIP-712)
 */
export interface ClaimVoucher {
  chainId: number
  contract: string        // RewardsDistributor address
  claimant: string        // User wallet
  amount: string          // Amount in wei
  token: string           // Token address (USDC or native)
  nonce: number
  validUntil: number      // Unix timestamp
}

/**
 * Off-Chain Claims Collection
 * Tracks bonus claims for ops processing
 */
export interface OffChainClaim {
  _id?: ObjectId
  userId: string
  wallet: string
  amount: string          // USDC6 or TOKEN18
  token: string
  reason: string          // "first_referral", "milestone_10", etc.
  claimId: string         // Unique identifier: "milestone:first_referral", "ref_event:ObjectId"
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deferred'
  idempoKey: string       // keccak256(lower(wallet)|amountMicro|token|claimId) - prevents double payment
  attempts: number        // Retry counter
  leaseAt?: Date          // When status changed to 'processing'
  voucher?: ClaimVoucher
  signature?: string
  claimedAt: Date
  processedAt?: Date
  txHash?: string         // If paid on-chain
  error?: string
}

/**
 * Referral Stats (cached in Redis)
 */
export interface ReferralStats {
  wallet: string
  invitedCount: number
  activeRefCount: number
  bonusClaimableTOKEN18: string
  totalClaimedTOKEN18: string
}

// Collection names
export const COLLECTIONS = {
  REF_CODES: 'ref_codes',
  REFERRALS: 'referrals',
  CLAIM_NONCES: 'claims_nonces',
  OFFCHAIN_CLAIMS: 'offchain_claims'
} as const

