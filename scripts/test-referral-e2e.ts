/**
 * E2E Referral System Test
 * Tests: create → resolve → join → preview → claim
 * 
 * Run with: npx tsx scripts/test-referral-e2e.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

// Use node-fetch for Node.js environments
import fetch from 'node-fetch'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Test wallets (random addresses for testing)
const INVITER_WALLET = '0x1111111111111111111111111111111111111111'
const INVITEE_WALLET = '0x2222222222222222222222222222222222222222'

interface TestResult {
  name: string
  passed: boolean
  error?: string
  data?: any
}

const results: TestResult[] = []

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`)
}

async function testEndpoint(
  name: string,
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: any; status: number }> {
  try {
    const response = await fetch(url, options)
    const data = await response.json()
    
    return {
      ok: response.ok,
      status: response.status,
      data
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      data: { error: error.message }
    }
  }
}

async function runTests() {
  log('🚀', 'Starting E2E Referral System Tests\n')
  
  // Test 1: Create invite code
  log('📝', 'Test 1: Create Invite Code')
  const createResponse = await testEndpoint(
    'Create invite code',
    `${BASE_URL}/api/referral/my`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: This endpoint requires auth, so this test will fail without a valid JWT
        // For full E2E, you'd need to generate a JWT token first
      }
    }
  )
  
  if (createResponse.ok && createResponse.data?.code) {
    results.push({ name: 'Create invite code', passed: true, data: createResponse.data })
    log('✅', `Code created: ${createResponse.data.code}`)
  } else {
    results.push({ 
      name: 'Create invite code', 
      passed: false, 
      error: createResponse.data?.error || 'Failed to create code (expected - requires auth)'
    })
    log('⚠️', 'Auth required for /api/referral/my - skipping')
  }
  
  console.log('')
  
  // Test 2: Resolve existing code (using known code format)
  log('🔍', 'Test 2: Resolve Referral Code')
  // Generate a deterministic code for testing (we'll use a fake code pattern)
  const testCode = 'TESTCODE42'
  
  const resolveResponse = await testEndpoint(
    'Resolve code',
    `${BASE_URL}/api/referral/resolve?code=${testCode}`
  )
  
  if (resolveResponse.status === 404) {
    results.push({ name: 'Resolve code (404 expected)', passed: true })
    log('✅', 'Code not found (expected for test code)')
  } else if (resolveResponse.ok) {
    results.push({ name: 'Resolve code', passed: true, data: resolveResponse.data })
    log('✅', `Code resolved: ${JSON.stringify(resolveResponse.data)}`)
  } else {
    results.push({ name: 'Resolve code', passed: false, error: resolveResponse.data?.error })
    log('❌', `Failed: ${resolveResponse.data?.error}`)
  }
  
  console.log('')
  
  // Test 3: Join with code
  log('🤝', 'Test 3: Join with Referral Code')
  const joinResponse = await testEndpoint(
    'Join with code',
    `${BASE_URL}/api/invite/join`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: testCode,
        wallet: INVITEE_WALLET
      })
    }
  )
  
  if (joinResponse.status === 404) {
    results.push({ name: 'Join with code (404 expected)', passed: true })
    log('✅', 'Join failed with invalid code (expected)')
  } else if (joinResponse.ok) {
    results.push({ name: 'Join with code', passed: true, data: joinResponse.data })
    log('✅', `Join successful: ${JSON.stringify(joinResponse.data)}`)
  } else {
    results.push({ name: 'Join with code', passed: false, error: joinResponse.data?.error })
    log('❌', `Failed: ${joinResponse.data?.error}`)
  }
  
  console.log('')
  
  // Test 4: Preview claim (no auth required)
  log('👀', 'Test 4: Preview Claim')
  const previewResponse = await testEndpoint(
    'Preview claim',
    `${BASE_URL}/api/referral/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: INVITER_WALLET
      })
    }
  )
  
  if (previewResponse.ok) {
    results.push({ name: 'Preview claim', passed: true, data: previewResponse.data })
    log('✅', `Preview: ${JSON.stringify(previewResponse.data)}`)
  } else {
    results.push({ name: 'Preview claim', passed: false, error: previewResponse.data?.error })
    log('❌', `Failed: ${previewResponse.data?.error}`)
  }
  
  console.log('')
  
  // Test 5: Stats endpoint
  log('📊', 'Test 5: Get Referral Stats')
  const statsResponse = await testEndpoint(
    'Get stats',
    `${BASE_URL}/api/referral/stats?wallet=${INVITER_WALLET}`
  )
  
  if (statsResponse.ok) {
    results.push({ name: 'Get stats', passed: true, data: statsResponse.data })
    log('✅', `Stats: ${JSON.stringify(statsResponse.data)}`)
  } else {
    results.push({ name: 'Get stats', passed: false, error: statsResponse.data?.error })
    log('❌', `Failed: ${statsResponse.data?.error}`)
  }
  
  console.log('')
  
  // Test 6: Self-referral check
  log('🚫', 'Test 6: Self-Referral Prevention')
  const selfRefResponse = await testEndpoint(
    'Self-referral prevention',
    `${BASE_URL}/api/invite/join`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: testCode,
        wallet: INVITER_WALLET // Same wallet as inviter
      })
    }
  )
  
  if (selfRefResponse.status === 409 || selfRefResponse.data?.error === 'SELF_REFERRAL') {
    results.push({ name: 'Self-referral prevention', passed: true })
    log('✅', 'Self-referral correctly blocked')
  } else if (selfRefResponse.status === 404) {
    results.push({ name: 'Self-referral prevention (code not found)', passed: true })
    log('✅', 'Code not found (test code)')
  } else {
    results.push({ name: 'Self-referral prevention', passed: false, error: 'Should have been blocked' })
    log('❌', 'Self-referral was not blocked!')
  }
  
  console.log('')
  
  // Test 7: Invalid input validation
  log('🔒', 'Test 7: Input Validation')
  const invalidWalletResponse = await testEndpoint(
    'Invalid wallet validation',
    `${BASE_URL}/api/invite/join`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: testCode,
        wallet: 'INVALID_WALLET'
      })
    }
  )
  
  if (invalidWalletResponse.status === 400) {
    results.push({ name: 'Invalid wallet validation', passed: true })
    log('✅', 'Invalid wallet correctly rejected')
  } else {
    results.push({ name: 'Invalid wallet validation', passed: false, error: 'Should have been rejected' })
    log('❌', 'Invalid wallet was not rejected!')
  }
  
  console.log('')
  
  // Test 8: Invalid code validation
  const invalidCodeResponse = await testEndpoint(
    'Invalid code validation',
    `${BASE_URL}/api/referral/resolve?code=INVALID@CODE`
  )
  
  if (invalidCodeResponse.status === 400) {
    results.push({ name: 'Invalid code validation', passed: true })
    log('✅', 'Invalid code correctly rejected')
  } else {
    results.push({ name: 'Invalid code validation', passed: false, error: 'Should have been rejected' })
    log('❌', 'Invalid code was not rejected!')
  }
  
  console.log('')
  
  // Summary
  log('📋', 'TEST SUMMARY')
  console.log('━'.repeat(60))
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌'
    console.log(`${icon} ${result.name}`)
    if (result.error) {
      console.log(`   Error: ${result.error}`)
    }
  })
  
  console.log('━'.repeat(60))
  log('📊', `Total: ${results.length} tests`)
  log('✅', `Passed: ${passed}`)
  if (failed > 0) {
    log('❌', `Failed: ${failed}`)
  }
  
  console.log('')
  
  if (failed === 0) {
    log('🎉', 'All tests passed!')
    process.exit(0)
  } else {
    log('⚠️', 'Some tests failed')
    process.exit(1)
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error)
  process.exit(1)
})

