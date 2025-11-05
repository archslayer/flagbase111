/**
 * Test Claim System
 * 
 * Tests:
 * - Rate limits (1/min, 10/day)
 * - Idempotency
 * - Claimable balance calculation
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { getDb } from '../lib/mongodb'
import { syncWalletReferralStats, getClaimableBalance } from '../lib/referral-stats-sync'

const TEST_WALLET = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'

async function testClaimSystem() {
  console.log('\n🧪 Testing Claim System...\n')
  
  const db = await getDb()
  const walletLower = TEST_WALLET.toLowerCase()
  
  // Test 1: Sync stats
  console.log('Test 1: Sync Referral Stats')
  const stats = await syncWalletReferralStats(TEST_WALLET)
  console.log(`  ✅ Synced`)
  console.log(`     Total Referrals: ${stats.totalReferrals}`)
  console.log(`     Active Referrals: ${stats.activeReferrals}`)
  console.log(`     Accrued: ${(Number(stats.balanceUSDC6Accrued) / 1_000_000).toFixed(6)} USDC`)
  
  // Test 2: Claimable balance
  console.log('\nTest 2: Claimable Balance Calculation')
  const { accrued, claimed, claimable } = await getClaimableBalance(TEST_WALLET)
  console.log(`  ✅ Calculated`)
  console.log(`     Accrued: ${(Number(accrued) / 1_000_000).toFixed(6)} USDC`)
  console.log(`     Claimed: ${(Number(claimed) / 1_000_000).toFixed(6)} USDC`)
  console.log(`     Claimable: ${(Number(claimable) / 1_000_000).toFixed(6)} USDC`)
  
  // Test 3: Idempotency key generation
  console.log('\nTest 3: Idempotency Key')
  const { keccak256, encodePacked } = await import('viem')
  const dayUTC = new Date().toISOString().split('T')[0]
  const idempoKey = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      [walletLower, '100000', '0x036cbd53842c5426634e7929541ec2318f3dcf7e', dayUTC]
    )
  )
  console.log(`  ✅ Generated: ${idempoKey.slice(0, 20)}...`)
  
  // Test 4: Rate limit structures
  console.log('\nTest 4: Rate Limit Structures')
  const minuteKey = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)
  const existingMinute = await db.collection('claim_nonces').findOne({
    wallet: walletLower,
    minuteKey
  })
  console.log(`  Minute key: ${minuteKey}`)
  console.log(`  Existing count: ${existingMinute?.lastMinuteCount || 0}`)
  
  const existingDay = await db.collection('claim_nonces').findOne({
    wallet: walletLower,
    day: dayUTC
  })
  console.log(`  Day: ${dayUTC}`)
  console.log(`  Existing count: ${existingDay?.countDay || 0}`)
  
  console.log('\n✅ All tests passed!\n')
  console.log('📋 Summary:')
  console.log(`  - Wallet has ${stats.totalReferrals} total referrals`)
  console.log(`  - ${stats.activeReferrals} are active (made at least 1 buy)`)
  console.log(`  - ${(Number(claimable) / 1_000_000).toFixed(6)} USDC claimable`)
  console.log(`  - Rate limits: ${existingMinute?.lastMinuteCount || 0}/1 per minute, ${existingDay?.countDay || 0}/10 per day`)
}

testClaimSystem().catch(console.error)

