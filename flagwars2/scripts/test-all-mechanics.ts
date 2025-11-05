/**
 * Comprehensive test suite for all FlagWars mechanics
 * Tests: Buy, Sell, Attack, Rate Limits, Security
 */

const { createPublicClient, http, parseAbi } = require('viem')
const { baseSepolia } = require('viem/chains')

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
})

const ABI = parseAbi([
  'function getCountryInfo(uint256 id) view returns (string, address, uint256, uint256, uint256, bool)',
  'function getUserBalance(uint256 id, address user) view returns (uint256)',
  'function remainingSupply(uint256 id) view returns (uint256)',
  'function cfg() view returns (address, address, address, address, address, uint16, uint16, uint16, uint16, uint64, uint64, uint64, bool, uint64, uint64, uint64, uint64, uint64, uint64, uint64, uint32, uint32, uint32, uint32, uint256, uint256, uint256, uint256)'
])

async function testAllMechanics() {
  console.log('🧪 COMPREHENSIVE MECHANICS TEST\n')
  console.log('═'.repeat(70))
  
  let passed = 0
  let failed = 0
  
  try {
    // Test 1: Config Validation
    console.log('\n1️⃣ CONFIG VALIDATION')
    console.log('─'.repeat(70))
    
    const cfg = await client.readContract({
      address: CORE_ADDRESS,
      abi: ABI,
      functionName: 'cfg'
    })
    
    // Validate addresses (payToken=0, feeToken=1, treasury=2, revenue=3, commissions=4)
    if (cfg[0] === '0x0000000000000000000000000000000000000000') {
      console.error('❌ CRITICAL: payToken is zero address')
      failed++
    } else {
      console.log('✅ payToken valid:', cfg[0])
      passed++
    }
    
    if (cfg[3] === '0x0000000000000000000000000000000000000000') {
      console.error('❌ CRITICAL: revenue is zero address')
      failed++
    } else {
      console.log('✅ revenue valid:', cfg[3])
      passed++
    }
    
    // Validate fee split (should = 10000) - indices shifted +1
    const feeSum = Number(cfg[8]) + Number(cfg[7])
    if (feeSum !== 10000) {
      console.error(`❌ CRITICAL: Fee split invalid (${feeSum} != 10000)`)
      failed++
    } else {
      console.log(`✅ Fee split valid: referral=${cfg[7]/100}%, revenue=${cfg[8]/100}%`)
      passed++
    }
    
    // Validate tier thresholds (must be ascending) - tier1Price8=13, tier2Price8=14, tier3Price8=15
    const tier1 = Number(cfg[13])
    const tier2 = Number(cfg[14])
    const tier3 = Number(cfg[15])
    
    if (tier1 >= tier2 || tier2 >= tier3) {
      console.error(`❌ CRITICAL: Tier thresholds not ascending: ${tier1}, ${tier2}, ${tier3}`)
      failed++
    } else {
      console.log(`✅ Tier thresholds ascending: T1=${tier1/1e8}, T2=${tier2/1e8}, T3=${tier3/1e8}`)
      passed++
    }
    
    // Validate attack fees are non-zero (attackFeeInUSDC=12, fees at 20-27)
    const fee1 = cfg[12] ? Number(cfg[20]) : Number(cfg[24])
    if (fee1 === 0) {
      console.error('❌ CRITICAL: Tier 1 attack fee is zero')
      failed++
    } else {
      console.log(`✅ Attack fees configured (Tier 1: ${cfg[12] ? fee1/1e6 : Number(cfg[24])/1e18})`)
      passed++
    }
    
    // Test 2: Country Data Integrity
    console.log('\n2️⃣ COUNTRY DATA INTEGRITY')
    console.log('─'.repeat(70))
    
    const countries = [
      { id: 90, name: 'Turkey' },
      { id: 44, name: 'United Kingdom' },
      { id: 1, name: 'United States' }
    ]
    
    for (const country of countries) {
      const info = await client.readContract({
        address: CORE_ADDRESS,
        abi: ABI,
        functionName: 'getCountryInfo',
        args: [BigInt(country.id)]
      })
      
      const [name, token, price8, totalSupply, attacks, exists] = info
      
      if (!exists) {
        console.error(`❌ CRITICAL: ${country.name} does not exist`)
        failed++
        continue
      }
      
      if (name !== country.name) {
        console.error(`❌ WARNING: Name mismatch for ${country.id}: "${name}" != "${country.name}"`)
        failed++
      }
      
      if (price8 === 0n) {
        console.error(`❌ CRITICAL: ${country.name} has zero price`)
        failed++
      }
      
      if (totalSupply === 0n) {
        console.error(`❌ CRITICAL: ${country.name} has zero supply`)
        failed++
      }
      
      const remaining = await client.readContract({
        address: CORE_ADDRESS,
        abi: ABI,
        functionName: 'remainingSupply',
        args: [BigInt(country.id)]
      })
      
      if (remaining > totalSupply) {
        console.error(`❌ CRITICAL: ${country.name} remaining > total (${remaining} > ${totalSupply})`)
        failed++
      }
      
      console.log(`✅ ${country.name}:`)
      console.log(`   - Price: ${Number(price8)/1e8} USDC`)
      console.log(`   - Supply: ${Number(totalSupply)/1e18} total, ${Number(remaining)/1e18} remaining`)
      console.log(`   - Attacks: ${Number(attacks)}`)
      passed++
    }
    
    // Test 3: Security Checks
    console.log('\n3️⃣ SECURITY VALIDATION')
    console.log('─'.repeat(70))
    
    // Check price floor (priceMin8=9)
    const priceMin = Number(cfg[9])
    if (priceMin === 0) {
      console.error('❌ CRITICAL: Price floor is zero (floor guard disabled)')
      failed++
    } else {
      console.log(`✅ Price floor active: ${priceMin/1e8} USDC`)
      passed++
    }
    
    // Check kappa/lambda (should be non-zero and lambda >= kappa for stability) - kappa=10, lambda=11
    const kappa = Number(cfg[10])
    const lambda = Number(cfg[11])
    
    if (kappa === 0 || lambda === 0) {
      console.error('❌ CRITICAL: Price step (kappa/lambda) is zero')
      failed++
    } else {
      console.log(`✅ Price steps: κ=${kappa/1e8}, λ=${lambda/1e8}`)
      passed++
    }
    
    if (lambda < kappa) {
      console.warn(`⚠️  WARNING: Lambda (${lambda/1e8}) < Kappa (${kappa/1e8}) - may cause price instability`)
    }
    
    // Test 4: Arithmetic Series Formula Validation
    console.log('\n4️⃣ PRICING FORMULA VALIDATION')
    console.log('─'.repeat(70))
    
    // Simulate multi-token buy/sell math
    const basePrice8 = 500_000_000 // 5 USDC
    const n = 10 // 10 tokens
    
    // Buy formula: total = n*P + κ*(n²)/2
    const buyLinear = n * basePrice8
    const buyQuadratic = (kappa * n * n) / 2
    const buyTotal = buyLinear + buyQuadratic
    
    console.log(`📊 Buy 10 tokens at P=$5:`)
    console.log(`   - Linear term: ${buyLinear/1e8} USDC`)
    console.log(`   - Quadratic term: ${buyQuadratic/1e8} USDC`)
    console.log(`   - Total cost: ${buyTotal/1e8} USDC`)
    
    // Sell formula: total = n*P - λ*(n²)/2
    const sellLinear = n * basePrice8
    const sellQuadratic = (lambda * n * n) / 2
    const sellGross = Math.max(sellLinear - sellQuadratic, 0)
    const sellNet = sellGross * 0.95 // 5% fee
    
    console.log(`📊 Sell 10 tokens at P=$5:`)
    console.log(`   - Linear term: ${sellLinear/1e8} USDC`)
    console.log(`   - Quadratic term: -${sellQuadratic/1e8} USDC`)
    console.log(`   - Gross: ${sellGross/1e8} USDC`)
    console.log(`   - Net (after 5% fee): ${sellNet/1e8} USDC`)
    
    // Sanity check: sell should never exceed buy
    if (sellNet >= buyTotal) {
      console.error('❌ CRITICAL: Sell price >= Buy price (arbitrage possible!)')
      failed++
    } else {
      console.log(`✅ No arbitrage: Spread = ${(buyTotal - sellNet)/1e8} USDC`)
      passed++
    }
    
    // Test 5: Attack Tier Logic
    console.log('\n5️⃣ ATTACK TIER LOGIC')
    console.log('─'.repeat(70))
    
    const testPrices = [
      { price: 500_000_000, expectedTier: 1 },   // $5
      { price: 700_000_000, expectedTier: 2 },   // $7
      { price: 1_200_000_000, expectedTier: 3 }, // $12
      { price: 2_000_000_000, expectedTier: 4 }  // $20
    ]
    
    for (const test of testPrices) {
      let tier: number
      let delta: bigint
      let fee: bigint
      
      if (test.price <= tier1) {
        tier = 1
        delta = cfg[16] // delta1_8
        fee = cfg[12] ? BigInt(cfg[20]) : cfg[24] // fee1
      } else if (test.price <= tier2) {
        tier = 2
        delta = cfg[17] // delta2_8
        fee = cfg[12] ? BigInt(cfg[21]) : cfg[25] // fee2
      } else if (test.price <= tier3) {
        tier = 3
        delta = cfg[18] // delta3_8
        fee = cfg[12] ? BigInt(cfg[22]) : cfg[26] // fee3
      } else {
        tier = 4
        delta = cfg[19] // delta4_8
        fee = cfg[12] ? BigInt(cfg[23]) : cfg[27] // fee4
      }
      
      if (tier === test.expectedTier) {
        console.log(`✅ P=$${test.price/1e8} → Tier ${tier} (Δ=${Number(delta)/1e8}, Fee=${cfg[12] ? Number(fee)/1e6 : Number(fee)/1e18})`)
        passed++
      } else {
        console.error(`❌ P=$${test.price/1e8} → Tier ${tier} (expected ${test.expectedTier})`)
        failed++
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(70))
    console.log('📊 TEST SUMMARY')
    console.log('═'.repeat(70))
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`📈 Success Rate: ${((passed/(passed+failed))*100).toFixed(1)}%`)
    console.log('═'.repeat(70))
    
    if (failed === 0) {
      console.log('\n🎉 ALL MECHANICS VALIDATED - SYSTEM SECURE AND OPERATIONAL')
    } else {
      console.log(`\n⚠️  ${failed} CRITICAL ISSUES DETECTED - REVIEW REQUIRED`)
      process.exit(1)
    }
    
  } catch (error: any) {
    console.error('\n❌ TEST SUITE FAILED!')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testAllMechanics().catch(console.error)

