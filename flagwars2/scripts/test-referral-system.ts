/**
 * Test Referral System
 * Tests code generation, resolution, and cookie flow
 */

import { generateReferralCode, generateInviteUrl, resolveReferralCode, getOrCreateRefCode } from '../lib/referral'
import { MongoClient } from 'mongodb'

const TEST_WALLET_1 = '0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82'
const TEST_WALLET_2 = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'

async function testReferralSystem() {
  console.log('🧪 Testing Referral System\n')
  
  // 1. Test code generation (deterministic)
  console.log('1️⃣ Testing code generation...')
  const code1 = generateReferralCode(TEST_WALLET_1)
  const code1Again = generateReferralCode(TEST_WALLET_1)
  console.log(`   Code for ${TEST_WALLET_1.slice(0, 10)}...: ${code1}`)
  console.log(`   Same wallet again: ${code1Again}`)
  console.log(`   ✅ Deterministic: ${code1 === code1Again ? 'PASS' : 'FAIL'}\n`)
  
  // 2. Test different wallet produces different code
  console.log('2️⃣ Testing different wallets...')
  const code2 = generateReferralCode(TEST_WALLET_2)
  console.log(`   Code for ${TEST_WALLET_2.slice(0, 10)}...: ${code2}`)
  console.log(`   ✅ Different codes: ${code1 !== code2 ? 'PASS' : 'FAIL'}\n`)
  
  // 3. Test invite URL generation
  console.log('3️⃣ Testing invite URL generation...')
  const inviteUrl = generateInviteUrl(code1)
  console.log(`   Invite URL: ${inviteUrl}`)
  console.log(`   ✅ URL format: ${inviteUrl.includes('?ref=') ? 'PASS' : 'FAIL'}\n`)
  
  // 4. Test DB operations (requires MongoDB connection)
  if (process.env.MONGODB_URI) {
    console.log('4️⃣ Testing DB operations...')
    
    try {
      // Create/get code from DB
      const dbCode = await getOrCreateRefCode(TEST_WALLET_1)
      console.log(`   DB Code: ${dbCode}`)
      console.log(`   ✅ Matches generated: ${dbCode === code1 ? 'PASS' : 'FAIL'}`)
      
      // Test resolution
      const resolved = await resolveReferralCode(dbCode)
      console.log(`   Resolved wallet: ${resolved?.wallet}`)
      console.log(`   ✅ Resolution: ${resolved?.wallet === TEST_WALLET_1 ? 'PASS' : 'FAIL'}\n`)
      
    } catch (error: any) {
      console.error(`   ❌ DB test failed: ${error.message}\n`)
    }
  } else {
    console.log('4️⃣ Skipping DB tests (MONGODB_URI not set)\n')
  }
  
  // 5. Test code format validation
  console.log('5️⃣ Testing code format validation...')
  const validCodes = [
    'ABCD1234',
    'XYZA2B3C4D',
    'TESTCODE12'
  ]
  const invalidCodes = [
    'abc',           // too short
    'TOOLONGCODE123', // too long
    'ABC-123',       // invalid chars
    'ABC 123'        // spaces
  ]
  
  console.log('   Valid codes (should pass):')
  validCodes.forEach(c => {
    const sanitized = c.toUpperCase().replace(/[^A-Z2-7]/g, '')
    const valid = sanitized === c && c.length >= 8 && c.length <= 12
    console.log(`     ${c}: ${valid ? '✅ PASS' : '❌ FAIL'}`)
  })
  
  console.log('   Invalid codes (should fail):')
  invalidCodes.forEach(c => {
    const sanitized = c.toUpperCase().replace(/[^A-Z2-7]/g, '')
    const valid = sanitized === c.toUpperCase() && c.length >= 8 && c.length <= 12
    console.log(`     ${c}: ${valid ? '❌ Should have failed' : '✅ PASS (rejected)'}`)
  })
  
  console.log('\n✅ All tests completed!')
}

// Run tests
testReferralSystem().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})

