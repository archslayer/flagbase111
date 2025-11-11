/**
 * Smoke Test: Duplicate Prevention
 * 
 * Tests that idempotency key prevents duplicate claims
 * by attempting to insert the same claim twice.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'
import { getAddress } from 'viem'
import { generateIdempoKey } from '../lib/idempotency-key'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'
const TEST_WALLET = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

async function smokeTest() {
  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const collection = db.collection('offchain_claims')

    // Test data
    const wallet = getAddress(TEST_WALLET).toLowerCase()
    const amount = '50000' // 0.05 USDC
    const claimId = `smoke_test:${Date.now()}`
    
    const idempoKey = generateIdempoKey(wallet, amount, USDC_ADDRESS, claimId)

    console.log('\n📊 Test Data:')
    console.log(`  Wallet: ${wallet}`)
    console.log(`  Amount: ${amount}`)
    console.log(`  ClaimId: ${claimId}`)
    console.log(`  IdempoKey: ${idempoKey}`)

    // Attempt 1: Should succeed
    console.log('\n🔄 Attempt 1: Insert claim...')
    try {
      const result1 = await collection.insertOne({
        userId: getAddress(TEST_WALLET),
        wallet,
        amount,
        token: USDC_ADDRESS.toLowerCase(),
        reason: 'smoke_test',
        claimId,
        status: 'pending',
        idempoKey,
        attempts: 0,
        claimedAt: new Date()
      })
      console.log(`✅ Insert 1 succeeded: ${result1.insertedId}`)
    } catch (error: any) {
      console.error(`❌ Insert 1 failed:`, error.message)
      throw error
    }

    // Attempt 2: Should fail (duplicate idempoKey)
    console.log('\n🔄 Attempt 2: Insert same claim again...')
    try {
      const result2 = await collection.insertOne({
        userId: getAddress(TEST_WALLET),
        wallet,
        amount,
        token: USDC_ADDRESS.toLowerCase(),
        reason: 'smoke_test',
        claimId,
        status: 'pending',
        idempoKey, // SAME KEY
        attempts: 0,
        claimedAt: new Date()
      })
      console.error(`❌ Insert 2 succeeded: ${result2.insertedId}`)
      console.error('❌ FAIL: Duplicate was NOT prevented!')
      process.exit(1)
    } catch (error: any) {
      if (error.code === 11000) { // Duplicate key error
        console.log('✅ Insert 2 blocked by unique index')
        console.log(`   Error: ${error.message}`)
      } else {
        console.error(`❌ Unexpected error:`, error.message)
        throw error
      }
    }

    // Cleanup
    console.log('\n🧹 Cleanup: Deleting test claim...')
    await collection.deleteOne({ idempoKey })
    console.log('✅ Test claim deleted')

    console.log('\n✅ SMOKE TEST PASSED!')
    console.log('   Duplicate prevention working correctly')

  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

smokeTest()

