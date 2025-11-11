// scripts/check-core-balances.ts
// Core kontratının token ve USDC balance'larını kontrol eder

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE) {
  throw new Error('NEXT_PUBLIC_CORE_ADDRESS not set in .env.local')
}

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// ERC20 ABI
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)'
])

// Core ABI
const CORE_ABI = parseAbi([
  'function remainingSupply(uint256 id) view returns (uint256)',
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

async function main() {
  console.log('🔍 Checking Core contract balances...\n')
  console.log('Core:', CORE)
  console.log('')

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  // 1. Check USDC balance
  console.log('='.repeat(60))
  console.log('1. USDC BALANCE')
  console.log('='.repeat(60))
  try {
    const usdcBalance = await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [CORE]
    }) as bigint
    console.log(`Core USDC balance: ${usdcBalance.toString()}`)
    console.log(`Core USDC balance: ${formatUnits(usdcBalance, 6)} USDC`)
  } catch (e: any) {
    console.error(`Error:`, e.message)
  }

  // 2. Check country token balances
  if (TOKEN_TR && TOKEN_UK && TOKEN_US) {
    console.log('\n' + '='.repeat(60))
    console.log('2. COUNTRY TOKEN BALANCES')
    console.log('='.repeat(60))

    const tokens = [
      { address: TOKEN_TR, name: 'Turkey Token', id: 90 },
      { address: TOKEN_UK, name: 'UK Token', id: 44 },
      { address: TOKEN_US, name: 'US Token', id: 1 }
    ]

    for (const token of tokens) {
      try {
        // Check Core balance
        const coreBalance = await publicClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [CORE]
        }) as bigint

        // Check remainingSupply from Core
        const remainingSupply = await publicClient.readContract({
          address: CORE,
          abi: CORE_ABI,
          functionName: 'remainingSupply',
          args: [BigInt(token.id)]
        }) as bigint

        // Check total supply
        const totalSupply = await publicClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'totalSupply',
          args: []
        }) as bigint

        console.log(`\n${token.name} (ID: ${token.id}):`)
        console.log(`  Token address: ${token.address}`)
        console.log(`  Core balance: ${coreBalance.toString()} (${formatUnits(coreBalance, 18)} tokens)`)
        console.log(`  Remaining supply (from Core): ${remainingSupply.toString()} (${formatUnits(remainingSupply, 18)} tokens)`)
        console.log(`  Total supply: ${totalSupply.toString()} (${formatUnits(totalSupply, 18)} tokens)`)
      } catch (e: any) {
        console.error(`\n${token.name}: Error -`, e.message)
      }
    }
  }

  // 3. Check country info
  console.log('\n' + '='.repeat(60))
  console.log('3. COUNTRY INFO')
  console.log('='.repeat(60))

  const countryIds = [90, 44, 1]
  for (const id of countryIds) {
    try {
      const result = await publicClient.readContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: 'countries',
        args: [BigInt(id)]
      })
      const [name, token, exists, price8, kappa8, lambda8, priceMin8] = result as [
        string,
        `0x${string}`,
        boolean,
        bigint,
        number,
        number,
        bigint
      ]

      console.log(`\nCountry ${id} (${name}):`)
      console.log(`  Exists: ${exists}`)
      console.log(`  Token: ${token}`)
      console.log(`  Price: ${Number(price8) / 1e8} USDC`)
      console.log(`  Kappa8: ${kappa8}`)
      console.log(`  Lambda8: ${lambda8}`)
      console.log(`  Price Min: ${Number(priceMin8) / 1e8} USDC`)
    } catch (e: any) {
      console.error(`\nCountry ${id}: Error -`, e.message)
    }
  }

  console.log('\n🎉 Done!')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

