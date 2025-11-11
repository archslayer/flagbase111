/**
 * Test script for new multicall API endpoints
 * Tests: /api/countries/userBalances and /api/config/attack
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const TEST_WALLET = '0x1c749BF6F2ccC3121b4413Aa49a9C7FaEa374d82' // deployer
const TEST_IDS = [90, 44, 1] // TR, UK, US

async function testMulticallAPI() {
  console.log('🧪 Testing Multicall API...\n')
  
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log(`👛 Test Wallet: ${TEST_WALLET}`)
  console.log(`🌍 Countries: ${TEST_IDS.join(', ')}\n`)
  
  const startTime = Date.now()
  
  try {
    // Test 1: User Balances Multicall
    console.log('1️⃣ Testing /api/countries/userBalances...')
    const balancesStart = Date.now()
    
    const balancesRes = await fetch(`${BASE_URL}/api/countries/userBalances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: TEST_IDS, wallet: TEST_WALLET })
    })
    
    const balancesTime = Date.now() - balancesStart
    
    if (!balancesRes.ok) {
      throw new Error(`HTTP ${balancesRes.status}: ${await balancesRes.text()}`)
    }
    
    const balancesData = await balancesRes.json()
    
    console.log(`✅ Status: ${balancesRes.status}`)
    console.log(`⏱️  Response Time: ${balancesTime}ms`)
    console.log(`📦 Data:`)
    console.log(JSON.stringify(balancesData, null, 2))
    
    // Validation
    if (!balancesData.ok || !Array.isArray(balancesData.items)) {
      throw new Error('Invalid response structure')
    }
    
    if (balancesData.items.length !== TEST_IDS.length) {
      throw new Error(`Expected ${TEST_IDS.length} items, got ${balancesData.items.length}`)
    }
    
    for (const item of balancesData.items) {
      if (!item.id || !item.name || item.balance18 === undefined || !item.price8) {
        throw new Error(`Invalid item structure: ${JSON.stringify(item)}`)
      }
      
      // Check if price is 5 USDC (500_000_000 in PRICE8)
      const expectedPrice = '500000000'
      if (item.price8 !== expectedPrice) {
        console.warn(`⚠️  Unexpected price for ${item.name}: ${item.price8} (expected ${expectedPrice})`)
      }
      
      console.log(`  - ${item.name} (${item.id}): Balance=${BigInt(item.balance18)/BigInt(1e18)} tokens, Price=${Number(item.price8)/1e8} USDC`)
    }
    
    console.log('\n')
    
    // Test 2: Attack Config
    console.log('2️⃣ Testing /api/config/attack...')
    const configStart = Date.now()
    
    const configRes = await fetch(`${BASE_URL}/api/config/attack`, {
      method: 'GET'
    })
    
    const configTime = Date.now() - configStart
    
    if (!configRes.ok) {
      throw new Error(`HTTP ${configRes.status}: ${await configRes.text()}`)
    }
    
    const configData = await configRes.json()
    
    console.log(`✅ Status: ${configRes.status}`)
    console.log(`⏱️  Response Time: ${configTime}ms`)
    console.log(`📦 Data:`)
    console.log(JSON.stringify(configData, null, 2))
    
    // Validation
    if (!configData.ok || !configData.config) {
      throw new Error('Invalid config response structure')
    }
    
    const cfg = configData.config
    
    // Validate tier parameters exist
    const requiredFields = [
      'attackFeeInUSDC', 
      'tier1Price8', 'tier2Price8', 'tier3Price8',
      'delta1_8', 'delta2_8', 'delta3_8', 'delta4_8',
      'fee1_USDC6', 'fee2_USDC6', 'fee3_USDC6', 'fee4_USDC6',
      'fee1_TOKEN18', 'fee2_TOKEN18', 'fee3_TOKEN18', 'fee4_TOKEN18'
    ]
    
    for (const field of requiredFields) {
      if (cfg[field] === undefined) {
        throw new Error(`Missing config field: ${field}`)
      }
    }
    
    console.log('\n📊 Tier Summary:')
    console.log(`  - Fee Mode: ${cfg.attackFeeInUSDC ? 'USDC (6d)' : 'TOKEN (18d)'}`)
    console.log(`  - Tier 1 (≤${Number(cfg.tier1Price8)/1e8} USDC): Δ=${Number(cfg.delta1_8)/1e8}, Fee=${cfg.attackFeeInUSDC ? Number(cfg.fee1_USDC6)/1e6 : Number(cfg.fee1_TOKEN18)/1e18}`)
    console.log(`  - Tier 2 (≤${Number(cfg.tier2Price8)/1e8} USDC): Δ=${Number(cfg.delta2_8)/1e8}, Fee=${cfg.attackFeeInUSDC ? Number(cfg.fee2_USDC6)/1e6 : Number(cfg.fee2_TOKEN18)/1e18}`)
    console.log(`  - Tier 3 (≤${Number(cfg.tier3Price8)/1e8} USDC): Δ=${Number(cfg.delta3_8)/1e8}, Fee=${cfg.attackFeeInUSDC ? Number(cfg.fee3_USDC6)/1e6 : Number(cfg.fee3_TOKEN18)/1e18}`)
    console.log(`  - Tier 4 (>${Number(cfg.tier3Price8)/1e8} USDC): Δ=${Number(cfg.delta4_8)/1e8}, Fee=${cfg.attackFeeInUSDC ? Number(cfg.fee4_USDC6)/1e6 : Number(cfg.fee4_TOKEN18)/1e18}`)
    
    console.log('\n')
    
    // Test 3: Client-side tier calculation
    console.log('3️⃣ Testing client-side tier calculation...')
    
    // Simulate for TR (price should be 5 USDC = 500_000_000)
    const trItem = balancesData.items.find((i: any) => i.id === 90)
    if (trItem) {
      const price8 = BigInt(trItem.price8)
      const tier1 = BigInt(cfg.tier1Price8)
      const tier2 = BigInt(cfg.tier2Price8)
      const tier3 = BigInt(cfg.tier3Price8)
      
      let tier: number
      let delta: string
      let fee: string
      
      if (price8 <= tier1) {
        tier = 1
        delta = cfg.delta1_8
        fee = cfg.attackFeeInUSDC ? cfg.fee1_USDC6.toString() : cfg.fee1_TOKEN18
      } else if (price8 <= tier2) {
        tier = 2
        delta = cfg.delta2_8
        fee = cfg.attackFeeInUSDC ? cfg.fee2_USDC6.toString() : cfg.fee2_TOKEN18
      } else if (price8 <= tier3) {
        tier = 3
        delta = cfg.delta3_8
        fee = cfg.attackFeeInUSDC ? cfg.fee3_USDC6.toString() : cfg.fee3_TOKEN18
      } else {
        tier = 4
        delta = cfg.delta4_8
        fee = cfg.attackFeeInUSDC ? cfg.fee4_USDC6.toString() : cfg.fee4_TOKEN18
      }
      
      console.log(`  - ${trItem.name} (Price: ${Number(price8)/1e8} USDC)`)
      console.log(`    → Tier: ${tier}`)
      console.log(`    → Delta: ${Number(delta)/1e8} USDC`)
      console.log(`    → Fee: ${cfg.attackFeeInUSDC ? Number(fee)/1e6 : Number(fee)/1e18} ${cfg.attackFeeInUSDC ? 'USDC' : 'TOKEN'}`)
      console.log(`  ✅ Client-side calculation successful!`)
    }
    
    console.log('\n')
    
    // Summary
    const totalTime = Date.now() - startTime
    console.log('═'.repeat(60))
    console.log('📊 TEST SUMMARY')
    console.log('═'.repeat(60))
    console.log(`✅ All tests passed!`)
    console.log(`⏱️  Total Time: ${totalTime}ms`)
    console.log(`⏱️  Balances API: ${balancesTime}ms`)
    console.log(`⏱️  Config API: ${configTime}ms`)
    console.log(`🎯 Performance: ${balancesTime < 500 ? 'EXCELLENT' : balancesTime < 1000 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`)
    console.log('═'.repeat(60))
    
  } catch (error: any) {
    console.error('\n❌ TEST FAILED!')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

// Run tests
testMulticallAPI().catch(console.error)

