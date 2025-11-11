// scripts/check-token-contract.ts
// Token contract'larının tipini ve owner'ını kontrol eder

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// ERC20 + Ownable ABI
const ABI = parseAbi([
  'function owner() view returns (address)',
  'function core() view returns (address)',
  'function TREASURY() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)'
])

async function main() {
  console.log('🔍 Checking token contracts...\n')

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  const tokens = [
    { address: TOKEN_TR, name: 'Turkey Token' },
    { address: TOKEN_UK, name: 'UK Token' },
    { address: TOKEN_US, name: 'US Token' }
  ]

  for (const token of tokens) {
    if (!token.address) {
      console.log(`\n${token.name}: Not set in .env.local`)
      continue
    }

    console.log(`\n${token.name}:`)
    console.log(`  Address: ${token.address}`)

    try {
      // Try to read name and symbol
      const name = await publicClient.readContract({
        address: token.address,
        abi: ABI,
        functionName: 'name',
        args: []
      }) as string

      const symbol = await publicClient.readContract({
        address: token.address,
        abi: ABI,
        functionName: 'symbol',
        args: []
      }) as string

      console.log(`  Name: ${name}`)
      console.log(`  Symbol: ${symbol}`)

      // Try to read owner (FlagToken)
      try {
        const owner = await publicClient.readContract({
          address: token.address,
          abi: ABI,
          functionName: 'owner',
          args: []
        }) as `0x${string}`
        console.log(`  Owner: ${owner}`)
      } catch {
        console.log(`  Owner: Not available (not Ownable)`)
      }

      // Try to read core (FlagWarsToken)
      try {
        const core = await publicClient.readContract({
          address: token.address,
          abi: ABI,
          functionName: 'core',
          args: []
        }) as `0x${string}`
        console.log(`  Core: ${core}`)
      } catch {
        console.log(`  Core: Not available (not FlagWarsToken)`)
      }

      // Try to read TREASURY (FlagToken)
      try {
        const treasury = await publicClient.readContract({
          address: token.address,
          abi: ABI,
          functionName: 'TREASURY',
          args: []
        }) as `0x${string}`
        console.log(`  Treasury: ${treasury}`)
      } catch {
        console.log(`  Treasury: Not available`)
      }

      // Total supply
      const totalSupply = await publicClient.readContract({
        address: token.address,
        abi: ABI,
        functionName: 'totalSupply',
        args: []
      }) as bigint

      console.log(`  Total Supply: ${totalSupply.toString()}`)
    } catch (e: any) {
      console.error(`  Error:`, e.message)
    }
  }

  console.log('\n🎉 Done!')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

