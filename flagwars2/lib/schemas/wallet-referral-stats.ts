/**
 * Wallet Referral Stats Schema
 * 
 * Tracks per-wallet referral metrics and claimable balance
 */

export interface WalletReferralStats {
  wallet: string                    // lowercase
  totalReferrals: number            // Total users referred (from referrals collection)
  activeReferrals: number           // Referees who made at least 1 buy
  balanceUSDC6Accrued: string       // Total referral earnings accumulated (as string for precision)
  lastUpdated: Date                 // Last time stats were synced
}

export const COLLECTIONS = {
  WALLET_REFERRAL_STATS: 'wallet_referral_stats'
} as const

