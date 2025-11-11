/**
 * Idempotency Key Generator for Off-Chain Claims
 * 
 * Generates deterministic keys to prevent double payments.
 * Key formula: keccak256(lower(wallet) | amountMicro | token | claimId)
 * 
 * IMPORTANT: Use claimId (not reason) for uniqueness
 * - claimId should be: milestone:first_referral, referral_event:ObjectId, etc.
 * - This prevents re-claiming same reward with different reasons
 */

import { keccak256, encodePacked } from 'viem'

/**
 * Generate idempotency key for a claim
 * 
 * @param wallet - User wallet address (will be lowercased)
 * @param amount - Amount in micro-units (e.g., "100000" for 0.10 USDC)
 * @param token - Token contract address
 * @param claimId - Unique claim identifier (e.g., "milestone:first_referral", "ref_event:ObjectId")
 * @returns Deterministic 32-byte hex string
 */
export function generateIdempoKey(
  wallet: string,
  amount: string,
  token: string,
  claimId: string
): string {
  // Normalize wallet to lowercase for consistency
  const walletLower = wallet.toLowerCase()
  
  // Create deterministic hash
  const hash = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [walletLower, amount, token.toLowerCase(), claimId]
    )
  )
  
  return hash
}

/**
 * Validate idempotency key format
 */
export function isValidIdempoKey(key: string): boolean {
  return /^0x[0-9a-f]{64}$/i.test(key)
}

