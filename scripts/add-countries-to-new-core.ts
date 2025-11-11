// scripts/add-countries-to-new-core.ts
// Yeni Core kontratına 3 ülke ekler (Turkey, UK, US)

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const PK = (process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PK) as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE) {
  throw new Error('NEXT_PUBLIC_CORE_ADDRESS not set in .env.local')
}
if (!PK) {
  throw new Error('DEPLOYER_PRIVATE_KEY not set in .env.local')
}

const abi = parseAbi([
  'function addCountry(uint256 id, string name, address token, uint256 price8Start, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

// Token adresleri (.env.local'den)
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

if (!TOKEN_TR || !TOKEN_UK || !TOKEN_US) {
  throw new Error('Token addresses not set in .env.local (TURKEY_TOKEN_ADDRESS, UK_TOKEN_ADDRESS, US_TOKEN_ADDRESS)')
}

// Ülke bilgileri
const countries = [
  {
    id: 90n,
    name: 'Turkey',
    token: TOKEN_TR,
  },
  {
    id: 44n,
    name: 'United Kingdom',
    token: TOKEN_UK,
  },
  {
    id: 1n,
    name: 'United States',
    token: TOKEN_US,
  }
]

// Ortak parametreler
const price8Start = 500_000_000n  // 5.00 USDC (8 decimals)
const kappa8 = 55_000              // Price increment per buy
const lambda8 = 55_550             // Price decrement per sell
const priceMin8 = 1_000_000n       // 0.01 USDC floor (8 decimals)

async function main() {
  console.log('🌍 Adding countries to new Core contract...\n')
  console.log('Core:', CORE)
  console.log('RPC:', RPC)
  console.log('')

  const account = privateKeyToAccount(PK)
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC)
  })
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  // Önce mevcut durumu kontrol et
  console.log('📋 Checking existing countries...\n')
  for (const country of countries) {
    try {
      const result = await publicClient.readContract({
        address: CORE,
        abi,
        functionName: 'countries',
        args: [country.id]
      })
      const [name, token, exists] = result as [string, `0x${string}`, boolean, bigint, number, number, bigint]
      if (exists) {
        console.log(`⚠️  Country ${country.id} (${country.name}) already exists`)
        console.log(`   Token: ${token}`)
        console.log('')
      }
    } catch (e) {
      // Country doesn't exist, continue
    }
  }

  // Ülkeleri ekle
  console.log('➕ Adding countries...\n')
  for (const country of countries) {
    try {
      console.log(`Adding ${country.name} (ID: ${country.id})...`)
      console.log(`  Token: ${country.token}`)
      console.log(`  Price Start: ${Number(price8Start) / 1e8} USDC`)
      console.log(`  Kappa8: ${kappa8}`)
      console.log(`  Lambda8: ${lambda8}`)
      console.log(`  Price Min: ${Number(priceMin8) / 1e8} USDC`)

      const hash = await wallet.writeContract({
        address: CORE,
        abi,
        functionName: 'addCountry',
        args: [
          country.id,
          country.name,
          country.token,
          price8Start,
          kappa8,
          lambda8,
          priceMin8
        ]
      })

      console.log(`  Transaction hash: ${hash}`)
      
      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ ${country.name} added! (Block: ${receipt.blockNumber})\n`)
      
      // Small delay to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.message?.includes('CountryExists')) {
        console.log(`  ⚠️  ${country.name} already exists, skipping...\n`)
      } else {
        console.error(`  ❌ Error adding ${country.name}:`, e.message)
        console.error('')
      }
    }
  }

  // Verify
  console.log('✅ Verification:\n')
  for (const country of countries) {
    try {
      const result = await publicClient.readContract({
        address: CORE,
        abi,
        functionName: 'countries',
        args: [country.id]
      })
      const [name, token, exists, price8, kappa8Result, lambda8Result, priceMin8Result] = result as [
        string,
        `0x${string}`,
        boolean,
        bigint,
        number,
        number,
        bigint
      ]
      
      if (exists) {
        console.log(`✅ ${name} (ID: ${country.id}):`)
        console.log(`   Token: ${token}`)
        console.log(`   Price: ${Number(price8) / 1e8} USDC`)
        console.log(`   Kappa8: ${kappa8Result}`)
        console.log(`   Lambda8: ${lambda8Result}`)
        console.log(`   Price Min: ${Number(priceMin8Result) / 1e8} USDC`)
        console.log('')
      } else {
        console.log(`❌ ${country.name} (ID: ${country.id}): NOT FOUND\n`)
      }
    } catch (e: any) {
      console.error(`❌ Error verifying ${country.name}:`, e.message)
      console.error('')
    }
  }

  console.log('🎉 Done!')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

