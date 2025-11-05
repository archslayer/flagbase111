/**
 * Debug inventory data source
 * Shows where the data comes from: Redis cache, MongoDB, or on-chain
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'
import { getAddress } from 'viem'
import { Redis } from 'ioredis'

// Direct imports without server-only
const COLLECTIONS = {
  USER_BALANCES: 'user_balances'
} as const

interface UserBalance {
  _id?: unknown
  userId: string
  countryId: number
  amountToken18: string
  amount: number
  updatedAt: Date
}

async function getDb() {
  const uri = process.env.MONGODB_URI || process.env.DATABASE_URL
  if (!uri) throw new Error('MONGODB_URI not set')
  const client = new MongoClient(uri)
  await client.connect()
  return client.db()
}

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url || url === 'false' || process.env.USE_REDIS !== 'true') {
    return null
  }
  return new Redis(url, { maxRetriesPerRequest: null })
}
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import { ACTIVE_COUNTRIES } from '../lib/constants'

dotenv.config({ path: '.env.local' })

const WALLET = process.argv[2] || '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
const userId = getAddress(WALLET)

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

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)'
])

async function debugInventory() {
  console.log('=== INVENTORY DATA SOURCE DEBUG ===\n')
  console.log(`Wallet: ${userId}\n`)

  // 1. Check Redis Cache
  console.log('1. REDIS CACHE:')
  const redis = await getRedis()
  if (redis) {
    const cacheKey = `inv:${userId}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached)
      console.log('   ✅ FOUND in cache')
      console.log('   Items:', JSON.stringify(data.items, null, 2))
      console.log('   Portfolio USDC6:', data.portfolioUSDC6)
      console.log('   Portfolio USD:', (data.portfolioUSDC6 / 1e6).toFixed(2))
    } else {
      console.log('   ❌ NOT FOUND in cache')
    }
  } else {
    console.log('   ⚠️  Redis not available')
  }

  console.log('\n2. MONGODB DATABASE:')
  const db = await getDb()
  const collection = db.collection<UserBalance>(COLLECTIONS.USER_BALANCES)
  const balances = await collection.find({ userId }).toArray()
  
  if (balances.length === 0) {
    console.log('   ❌ NO DATA in MongoDB')
  } else {
    console.log(`   ✅ FOUND ${balances.length} records:`)
    for (const balance of balances) {
      console.log(`      Country ID: ${balance.countryId}`)
      console.log(`      Amount (DB): ${balance.amount}`)
      console.log(`      Amount Token18 (DB): ${balance.amountToken18}`)
      console.log(`      Updated At: ${balance.updatedAt}`)
      console.log('')
    }
  }

  console.log('\n3. ON-CHAIN DATA (CONTRACT):')
  const ALL_COUNTRY_IDS = ACTIVE_COUNTRIES.map(c => c.id)
  console.log(`   Checking countries: ${ALL_COUNTRY_IDS.join(', ')}`)
  
  // Get token addresses
  const tokenCalls = ALL_COUNTRY_IDS.map(id => ({
    address: CORE_ADDRESS,
    abi: ABI,
    functionName: 'countries' as const,
    args: [BigInt(id)]
  }))
  
  const tokenResults = await client.multicall({ 
    contracts: tokenCalls, 
    allowFailure: true 
  })

  // Get balances
  const balanceCalls = ALL_COUNTRY_IDS.map((id, i) => {
    const tokenResult = tokenResults[i]
    if (tokenResult.status === 'success') {
      const tokenAddr = tokenResult.result[1] as `0x${string}`
      return {
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'balanceOf' as const,
        args: [userId]
      }
    }
    return null
  }).filter(Boolean) as any[]

  const balanceResults = await client.multicall({ 
    contracts: balanceCalls, 
    allowFailure: true 
  })

  console.log('   On-chain balances:')
  for (let i = 0; i < ALL_COUNTRY_IDS.length; i++) {
    const countryId = ALL_COUNTRY_IDS[i]
    const tokenResult = tokenResults[i]
    const balanceResult = balanceResults[i]
    
    if (tokenResult.status === 'success' && balanceResult.status === 'success') {
      const [name, token, exists, price8] = tokenResult.result as any
      const balance18 = balanceResult.result as bigint
      
      if (balance18 > 0n) {
        const balance = Number(formatUnits(balance18, 18))
        const priceUSDC6 = Number(price8 / 100n)
        const valueUSDC6 = balance * priceUSDC6
        
        console.log(`      ${name} (ID: ${countryId}):`)
        console.log(`         Balance: ${balance.toFixed(4)} tokens`)
        console.log(`         Price: $${(priceUSDC6 / 1e6).toFixed(2)} per token`)
        console.log(`         Value: $${(valueUSDC6 / 1e6).toFixed(2)}`)
        console.log('')
      }
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log('Inventory API will use:')
  if (redis) {
    const cacheKey = `inv:${userId}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      console.log('  1. Redis Cache (FIRST PRIORITY)')
      return
    }
  }
  if (balances.length > 0) {
    console.log('  2. MongoDB Database (SECOND PRIORITY)')
    console.log('     Then fetches price from contract')
    return
  }
  console.log('  3. On-chain query (FALLBACK)')
  console.log('     Then writes to DB for future reads')
}

debugInventory()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })

