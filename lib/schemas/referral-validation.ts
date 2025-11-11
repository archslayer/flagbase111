/**
 * Zod Validation Schemas for Referral System
 * All API input validation for referral endpoints
 */

import { z } from 'zod'

// Ethereum address regex (0x + 40 hex chars)
const EthAddr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

// Referral code format (8-12 chars, A-Z2-7 for base32-like)
const RefCode = z.string().regex(/^[A-Z2-7]{8,12}$/, 'Invalid referral code format')

/**
 * POST /api/invite/create
 * Create or get referral code for wallet
 */
export const CreateInviteIn = z.object({
  wallet: EthAddr
})

export type CreateInviteInT = z.infer<typeof CreateInviteIn>

/**
 * GET /api/invite/resolve?code=ABC123
 * Resolve referral code to wallet
 */
export const ResolveInviteIn = z.object({
  code: RefCode
})

export type ResolveInviteInT = z.infer<typeof ResolveInviteIn>

/**
 * POST /api/invite/join
 * Join with referral code (register referral relationship)
 */
export const JoinInviteIn = z.object({
  code: RefCode,
  wallet: EthAddr
})

export type JoinInviteInT = z.infer<typeof JoinInviteIn>

/**
 * POST /api/referral/preview
 * Preview claimable rewards
 */
export const ClaimPreviewIn = z.object({
  wallet: EthAddr
})

export type ClaimPreviewInT = z.infer<typeof ClaimPreviewIn>

/**
 * POST /api/referral/claim
 * Claim off-chain bonus reward
 */
export const ClaimIn = z.object({
  wallet: EthAddr
})

export type ClaimInT = z.infer<typeof ClaimIn>

/**
 * Helper: Normalize wallet address (lowercase for DB queries)
 */
export function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase()
}

/**
 * Helper: Normalize referral code (uppercase)
 */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

