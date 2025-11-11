/**
 * Check if prices are being fetched dynamically from contract
 */

import dotenv from 'dotenv'
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import { ACTIVE_COUNTRIES } from '../lib/constants'
import { Redis } from 'ioredis'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({ 
  chain: baseSepolia, 
  transport: http(RPC, { 
    batch: true,
    timeout: 10000,
    retryCount: 1
  })
})

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url === 'false' || process.env.USE_REDIS !== 'true') {
    return null
  }
  return new Redis(url, { maxRetriesPerRequest: null })
}

async function checkPrices() {
  console.log('=== PRICE CHECK (Dynamic vs Static) ===\n')
  
  const ALL_COUNTRY_IDS = ACTIVE_COUNTRIES.map(c => c.id)
  const redis = getRedis()

  // 1. Check Redis cache
  console.log('1. REDIS CACHE PRICES:')
  if (redis) {
    for (const id of ALL_COUNTRY_IDS) {
      const priceKey = `price:${id}`
      const cached = await redis.get(priceKey)
      if (cached) {
        const priceUSDC6 = Number(cached)
        console.log(`   Country ${id}: ${priceUSDC6} micro-USDC = $${(priceUSDC6 / 1e6).toFixed(2)} (CACHED)`)
      } else {
        console.log(`   Country ${id}: No cache`)
      }
    }
  } else {
    console.log('   Redis not available')
  }

  // 2. Check contract (ON-CHAIN - REAL)
  console.log('\n2. ON-CHAIN CONTRACT PRICES (REAL):')
  const priceCalls = ALL_COUNTRY_IDS.map(id => ({
    address: CORE_ADDRESS,
    abi: ABI,
    functionName: 'countries' as const,
    args: [BigInt(id)]
  }))
  
  const results = await client.multicall({ 
    contracts: priceCalls, 
    allowFailure: true 
  })

  for (let i = 0; i < ALL_COUNTRY_IDS.length; i++) {
    const countryId = ALL_COUNTRY_IDS[i]
    const result = results[i]
    
    if (result.status === 'success') {
      const [name, token, exists, price8, kappa8, lambda8, priceMin8] = result.result as any
      const priceUSDC6 = Number(price8 / 100n)
      const priceUSD = priceUSDC6 / 1e6
      
      console.log(`   ${name} (ID: ${countryId}):`)
      console.log(`      price8: ${price8.toString()}`)
      console.log(`      priceUSDC6: ${priceUSDC6} micro-USDC`)
      console.log(`      price USD: $${priceUSD.toFixed(4)}`)
      
      // Check if cached price matches
      if (redis) {
        const priceKey = `price:${countryId}`
        const cached = await redis.get(priceKey)
        if (cached) {
          const cachedPriceUSDC6 = Number(cached)
          const diff = Math.abs(priceUSDC6 - cachedPriceUSDC6)
          if (diff > 100) { // More than 0.0001 USDC difference
            console.log(`      ⚠️  CACHE MISMATCH! Cached: $${(cachedPriceUSDC6 / 1e6).toFixed(4)}, Real: $${priceUSD.toFixed(4)}`)
          } else {
            console.log(`      ✅ Cache matches`)
          }
        }
      }
    }
  }

  if (redis) {
    await redis.quit()
  }
}

checkPrices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })

