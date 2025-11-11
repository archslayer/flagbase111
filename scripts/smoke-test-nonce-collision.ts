/**
 * Smoke Test: Nonce Collision Prevention
 * 
 * Tests that nonce manager prevents collisions when
 * multiple claims are processed in parallel.
 * 
 * NOTE: This is a simulation test (doesn't send real transactions)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { publicClient, getTreasuryAddress } from '../lib/viem/clients'
import { getNextNonce, markTransactionConfirmed, resetNonceCounter, getNonceState } from '../lib/nonce-manager'

async function smokeTest() {
  try {
    console.log('🧪 Testing Nonce Manager...')
    console.log('')

    const treasuryAddr = getTreasuryAddress()
    console.log(`Treasury: ${treasuryAddr}`)

    // Reset state
    resetNonceCounter()

    // Fetch initial nonce from chain
    const chainNonce = await publicClient.getTransactionCount({
      address: treasuryAddr,
      blockTag: 'pending'
    })
    console.log(`Chain nonce (pending): ${chainNonce}`)
    console.log('')

    // Simulate 5 parallel claims
    console.log('🔄 Simulating 5 parallel claims...')
    const nonces: number[] = []

    for (let i = 0; i < 5; i++) {
      const nonce = await getNextNonce(publicClient, treasuryAddr)
      nonces.push(nonce)
      console.log(`  Claim ${i + 1}: nonce ${nonce}`)
    }

    console.log('')

    // Verify nonces are sequential
    console.log('✓ Verification:')
    let isSequential = true
    for (let i = 0; i < nonces.length - 1; i++) {
      if (nonces[i + 1] !== nonces[i] + 1) {
        console.error(`❌ Gap detected: ${nonces[i]} → ${nonces[i + 1]}`)
        isSequential = false
      }
    }

    // Check for duplicates
    const uniqueNonces = new Set(nonces)
    if (uniqueNonces.size !== nonces.length) {
      console.error('❌ Duplicate nonces detected!')
      isSequential = false
    } else {
      console.log('  ✅ No duplicate nonces')
    }

    if (isSequential) {
      console.log('  ✅ Nonces are sequential')
    }

    // Check state
    const state = getNonceState()
    console.log('')
    console.log('📊 Final state:')
    console.log(`  Current nonce: ${state.currentNonce}`)
    console.log(`  Pending transactions: ${state.pendingTransactions}`)

    // Simulate transaction confirmations
    console.log('')
    console.log('🔄 Simulating transaction confirmations...')
    for (let i = 0; i < 5; i++) {
      markTransactionConfirmed()
      const updatedState = getNonceState()
      console.log(`  TX ${i + 1} confirmed - Pending: ${updatedState.pendingTransactions}`)
    }

    const finalState = getNonceState()
    console.log('')
    console.log('📊 After confirmations:')
    console.log(`  Current nonce: ${finalState.currentNonce} (should be null)`)
    console.log(`  Pending transactions: ${finalState.pendingTransactions}`)

    if (finalState.currentNonce === null && finalState.pendingTransactions === 0) {
      console.log('  ✅ State reset correctly')
    } else {
      console.error('  ❌ State not reset correctly')
      isSequential = false
    }

    console.log('')
    if (isSequential) {
      console.log('✅ SMOKE TEST PASSED!')
      console.log('   Nonce collision prevention working correctly')
    } else {
      console.error('❌ SMOKE TEST FAILED!')
      process.exit(1)
    }

  } catch (error) {
    console.error('\n❌ SMOKE TEST FAILED:', error)
    process.exit(1)
  }
}

smokeTest()

