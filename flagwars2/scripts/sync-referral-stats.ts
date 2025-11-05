/**
 * Sync Referral Stats for Testing
 * 
 * Manually syncs referral stats for a wallet
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { syncWalletReferralStats, getClaimableBalance } from '../lib/referral-stats-sync'

const WALLET = process.argv[2] || '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'

async function main() {
  console.log(`\n🔄 Syncing referral stats for ${WALLET}...`)
  
  const stats = await syncWalletReferralStats(WALLET)
  
  console.log('\n✅ Stats synced:')
  console.log(`   Total Referrals: ${stats.totalReferrals}`)
  console.log(`   Active Referrals: ${stats.activeReferrals}`)
  console.log(`   Accrued: ${(Number(stats.balanceUSDC6Accrued) / 1_000_000).toFixed(6)} USDC`)
  
  // Calculate claimable
  const { accrued, claimed, claimable } = await getClaimableBalance(WALLET)
  
  console.log('\n💰 Claimable Balance:')
  console.log(`   Accrued: ${(Number(accrued) / 1_000_000).toFixed(6)} USDC`)
  console.log(`   Claimed: ${(Number(claimed) / 1_000_000).toFixed(6)} USDC`)
  console.log(`   Claimable: ${(Number(claimable) / 1_000_000).toFixed(6)} USDC`)
  
  if (claimable > 0n) {
    console.log('\n🎯 User can claim!')
  } else {
    console.log('\n⚠️  No claimable balance (either nothing accrued or already claimed)')
  }
}

main()

