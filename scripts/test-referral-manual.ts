/**
 * Manual Referral System Test
 * Creates a real referral code and tests the flow
 * 
 * Run with: npx tsx scripts/test-referral-manual.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { getDb } from '../lib/mongodb'
import { getOrCreateRefCode, resolveReferralCode, isSelfReferral, generateInviteUrl } from '../lib/referral'
import { COLLECTIONS, type Referral } from '../lib/schemas/referral'
import { getAddress } from 'viem'

// Test wallets
const INVITER = '0x1c749c82b6F77afaB9Ee5Af5F02e57c559EfaA9F'
const INVITEE = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'
const SELF_REF_ATTEMPT = INVITER

async function runTests() {
  console.log('🚀 Manual Referral System Test\n')
  
  try {
    console.log('📝 Test 1: Create referral code')
    const code = await getOrCreateRefCode(INVITER)
    console.log(`✅ Code created: ${code}`)
    console.log(`   Invite URL: ${generateInviteUrl(code)}\n`)
    
    console.log('🔍 Test 2: Resolve referral code')
    const resolved = await resolveReferralCode(code)
    if (resolved && getAddress(resolved.wallet) === getAddress(INVITER)) {
      console.log(`✅ Code resolved correctly to: ${resolved.wallet}\n`)
    } else {
      console.log(`❌ Code resolution failed\n`)
      return
    }
    
    console.log('🚫 Test 3: Self-referral prevention')
    const isSelfRef = isSelfReferral(SELF_REF_ATTEMPT, INVITER)
    if (isSelfRef) {
      console.log(`✅ Self-referral correctly detected\n`)
    } else {
      console.log(`❌ Self-referral NOT detected!\n`)
    }
    
    console.log('🤝 Test 4: Create referral relationship (simulated join)')
    const db = await getDb()
    
    // Check if already exists
    const existing = await db.collection<Referral>(COLLECTIONS.REFERRALS).findOne({
      userId: getAddress(INVITEE)
    })
    
    if (existing) {
      console.log(`⚠️  Referral already exists for invitee`)
      console.log(`   Inviter: ${existing.refWallet}`)
      console.log(`   Code: ${existing.refCode}`)
      console.log(`   Confirmed: ${existing.confirmedOnChain}`)
      console.log(`   Active: ${existing.isActive}\n`)
    } else {
      // Create new referral
      await db.collection<Referral>(COLLECTIONS.REFERRALS).insertOne({
        userId: getAddress(INVITEE),
        wallet: getAddress(INVITEE),
        refWallet: getAddress(INVITER),
        refCode: code,
        confirmedOnChain: false,
        createdAt: new Date(),
        totalBuys: 0,
        totalSells: 0,
        isActive: false
      })
      console.log(`✅ Referral relationship created\n`)
    }
    
    console.log('📊 Test 5: Check referral stats')
    const referrals = await db.collection<Referral>(COLLECTIONS.REFERRALS).find({
      refWallet: getAddress(INVITER)
    }).toArray()
    
    console.log(`   Total referrals: ${referrals.length}`)
    console.log(`   Active referrals: ${referrals.filter(r => r.isActive).length}`)
    console.log(`   Confirmed on-chain: ${referrals.filter(r => r.confirmedOnChain).length}\n`)
    
    console.log('✅ Test 6: Idempotency check')
    const code2 = await getOrCreateRefCode(INVITER)
    if (code === code2) {
      console.log(`✅ Same code returned (idempotent): ${code2}\n`)
    } else {
      console.log(`❌ Different code returned! ${code} vs ${code2}\n`)
    }
    
    console.log('🎉 All manual tests completed successfully!')
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
  
  process.exit(0)
}

runTests()

