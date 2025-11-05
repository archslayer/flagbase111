/**
 * Referral Stats Sync
 * 
 * Syncs wallet_referral_stats from referrals and tx_events
 */

import { getDb } from './mongodb'
import type { WalletReferralStats } from './schemas/wallet-referral-stats'

const COLLECTIONS = {
  REFERRALS: 'referrals',
  TX_EVENTS: 'tx_events',
  OFFCHAIN_CLAIMS: 'offchain_claims',
  WALLET_REFERRAL_STATS: 'wallet_referral_stats'
} as const

/**
 * Sync referral stats for a specific wallet
 */
export async function syncWalletReferralStats(wallet: string): Promise<WalletReferralStats> {
  const walletLower = wallet.toLowerCase()
  const db = await getDb()

  // Count total referrals (users who used this wallet's ref code)
  const totalReferrals = await db.collection(COLLECTIONS.REFERRALS).countDocuments({
    refWalletLower: walletLower,
    confirmedOnChain: true
  })

  // Count active referrals (referees who made at least 1 buy)
  // This requires checking tx_events for buy transactions by referees
  const referees = await db.collection(COLLECTIONS.REFERRALS)
    .find({
      refWalletLower: walletLower,
      confirmedOnChain: true
    })
    .project({ walletLower: 1 })
    .toArray()

  const refereeWallets = referees.map(r => r.walletLower)
  
  const activeReferrals = refereeWallets.length > 0
    ? await db.collection(COLLECTIONS.TX_EVENTS)
        .distinct('wallet', {
          wallet: { $in: refereeWallets },
          type: 'buy'
        })
        .then(wallets => wallets.length)
    : 0

  // Calculate total accrued referral earnings
  // For each referee's sell, 30% goes to referrer
  // We need to sum: (sell fee * 0.30) for all referee sells
  
  const referralEarnings = refereeWallets.length > 0
    ? await db.collection(COLLECTIONS.TX_EVENTS).aggregate([
        {
          $match: {
            wallet: { $in: refereeWallets },
            type: 'sell',
            feeUSDC6: { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            totalFees: { $sum: { $toLong: '$feeUSDC6' } }
          }
        }
      ]).toArray()
    : []

  const totalFeesCollected = referralEarnings[0]?.totalFees || 0
  const referrerShare = Math.floor(Number(totalFeesCollected) * 0.30) // 30% to referrer
  const balanceUSDC6Accrued = referrerShare.toString()

  // Update or insert stats
  const stats: WalletReferralStats = {
    wallet: walletLower,
    totalReferrals,
    activeReferrals,
    balanceUSDC6Accrued,
    lastUpdated: new Date()
  }

  await db.collection(COLLECTIONS.WALLET_REFERRAL_STATS).updateOne(
    { wallet: walletLower },
    { $set: stats },
    { upsert: true }
  )

  return stats
}

/**
 * Get wallet referral stats (cached)
 */
export async function getWalletReferralStats(wallet: string): Promise<WalletReferralStats | null> {
  const walletLower = wallet.toLowerCase()
  const db = await getDb()

  const stats = await db.collection<WalletReferralStats>(COLLECTIONS.WALLET_REFERRAL_STATS)
    .findOne({ wallet: walletLower })

  // If stats don't exist or are older than 5 minutes, sync
  if (!stats || (new Date().getTime() - stats.lastUpdated.getTime()) > 5 * 60 * 1000) {
    return await syncWalletReferralStats(wallet)
  }

  return stats
}

/**
 * Calculate claimable balance
 * claimable = accrued - claimed
 */
export async function getClaimableBalance(wallet: string): Promise<{
  accrued: bigint
  claimed: bigint
  claimable: bigint
}> {
  const walletLower = wallet.toLowerCase()
  const db = await getDb()

  // Get accrued from stats
  const stats = await getWalletReferralStats(wallet)
  const accrued = BigInt(stats?.balanceUSDC6Accrued || '0')

  // Get total claimed from offchain_claims
  const claimedDocs = await db.collection(COLLECTIONS.OFFCHAIN_CLAIMS).aggregate([
    {
      $match: {
        wallet: walletLower,
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $toLong: '$amount' } }
      }
    }
  ]).toArray()

  const claimed = BigInt(claimedDocs[0]?.total || 0)
  const claimable = accrued > claimed ? accrued - claimed : 0n

  return { accrued, claimed, claimable }
}

