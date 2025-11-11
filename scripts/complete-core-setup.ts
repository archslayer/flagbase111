// scripts/complete-core-setup.ts
// Yeni Core için tam setup: token set, mint, country add, USDC fund

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const DEPLOYER_PK = (process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PK) as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE) {
  throw new Error('NEXT_PUBLIC_CORE_ADDRESS not set in .env.local')
}

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// FlagWarsToken ABI
const FLAG_WARS_TOKEN_ABI = parseAbi([
  'function setCore(address coreAddress)',
  'function mint(address to, uint256 amount)',
  'function owner() view returns (address)',
  'function core() view returns (address)'
])

// Core ABI
const CORE_ABI = parseAbi([
  'function addCountry(uint256 id, string name, address token, uint256 price8Start, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function mintCountryTokens(uint256 id, uint256 amount18)',
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)'
])

// ERC20 ABI
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
])

const countries = [
  { id: 90n, name: 'Turkey', token: TOKEN_TR },
  { id: 44n, name: 'United Kingdom', token: TOKEN_UK },
  { id: 1n, name: 'United States', token: TOKEN_US }
]

const price8Start = 500_000_000n  // 5.00 USDC
const kappa8 = 55_000
const lambda8 = 55_550
const priceMin8 = 1_000_000n       // 0.01 USDC
const TOKENS_PER_COUNTRY = parseUnits('50000', 18) // 50,000 tokens

async function main() {
  console.log('🚀 Complete Core Setup...\n')
  console.log('Core:', CORE)
  console.log('')

  const account = privateKeyToAccount(DEPLOYER_PK as `0x${string}`)
  const deployerAddress = account.address

  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC)
  })
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  // 1. Set Core for tokens
  console.log('='.repeat(60))
  console.log('1. SETTING CORE FOR TOKENS')
  console.log('='.repeat(60))

  for (const country of countries) {
    if (!country.token) {
      console.log(`\n${country.name}: Token not set`)
      continue
    }

    try {
      const currentCore = await publicClient.readContract({
        address: country.token,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'core',
        args: []
      }) as `0x${string}`

      if (currentCore.toLowerCase() === CORE.toLowerCase()) {
        console.log(`\n${country.name}: Core already set`)
        continue
      }

      if (currentCore !== '0x0000000000000000000000000000000000000000') {
        console.log(`\n${country.name}: Core already set to different address`)
        continue
      }

      const owner = await publicClient.readContract({
        address: country.token,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'owner',
        args: []
      }) as `0x${string}`

      if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
        console.log(`\n${country.name}: Not owner (owner: ${owner})`)
        continue
      }

      console.log(`\n${country.name}: Setting Core...`)
      const hash = await wallet.writeContract({
        address: country.token,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'setCore',
        args: [CORE]
      })

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Core set`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      console.error(`\n${country.name}: Error -`, e.message)
    }
  }

  // 2. Add countries to Core
  console.log('\n' + '='.repeat(60))
  console.log('2. ADDING COUNTRIES TO CORE')
  console.log('='.repeat(60))

  for (const country of countries) {
    if (!country.token) continue

    try {
      const result = await publicClient.readContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: 'countries',
        args: [country.id]
      })
      const exists = (result as any)[2] as boolean

      if (exists) {
        console.log(`\n${country.name}: Already exists`)
        continue
      }

      console.log(`\n${country.name}: Adding...`)
      const hash = await wallet.writeContract({
        address: CORE,
        abi: CORE_ABI,
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

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Added`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      console.error(`\n${country.name}: Error -`, e.message)
    }
  }

  // 3. Mint tokens from Core
  console.log('\n' + '='.repeat(60))
  console.log('3. MINTING TOKENS FROM CORE')
  console.log('='.repeat(60))
  console.log(`Amount: ${formatUnits(TOKENS_PER_COUNTRY, 18)} tokens per country\n`)

  for (const country of countries) {
    if (!country.token) continue

    try {
      console.log(`${country.name}: Minting...`)
      const hash = await wallet.writeContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: 'mintCountryTokens',
        args: [country.id, TOKENS_PER_COUNTRY]
      })

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Minted`)
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      console.error(`\n${country.name}: Error -`, e.message)
    }
  }

  // 4. Transfer USDC to Core
  console.log('\n' + '='.repeat(60))
  console.log('4. TRANSFERRING USDC TO CORE')
  console.log('='.repeat(60))

  try {
    const balance = await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [deployerAddress]
    }) as bigint

    const USDC_AMOUNT = parseUnits('10000', 6)
    const amount = balance < USDC_AMOUNT ? balance : USDC_AMOUNT

    console.log(`\nDeployer balance: ${formatUnits(balance, 6)} USDC`)
    console.log(`Transferring: ${formatUnits(amount, 6)} USDC`)

    if (amount > 0n) {
      const hash = await wallet.writeContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [CORE, amount]
      })

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Transferred`)
    }
  } catch (e: any) {
    console.error(`\nUSDC: Error -`, e.message)
  }

  // 5. Verify
  console.log('\n' + '='.repeat(60))
  console.log('5. VERIFICATION')
  console.log('='.repeat(60))

  for (const country of countries) {
    if (!country.token) continue

    try {
      const result = await publicClient.readContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: 'countries',
        args: [country.id]
      })
      const [name, token, exists, price8] = result as [string, `0x${string}`, boolean, bigint, number, number, bigint]

      const remaining = await publicClient.readContract({
        address: CORE,
        abi: CORE_ABI,
        functionName: 'remainingSupply',
        args: [country.id]
      }) as bigint

      console.log(`\n${name} (ID: ${country.id}):`)
      console.log(`  Exists: ${exists}`)
      console.log(`  Price: ${Number(price8) / 1e8} USDC`)
      console.log(`  Remaining Supply: ${formatUnits(remaining, 18)} tokens`)
    } catch (e: any) {
      console.error(`\n${country.name}: Error -`, e.message)
    }
  }

  // Check USDC balance
  try {
    const usdcBalance = await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [CORE]
    }) as bigint
    console.log(`\nCore USDC balance: ${formatUnits(usdcBalance, 6)} USDC`)
  } catch (e: any) {
    console.error(`\nUSDC balance: Error -`, e.message)
  }

  console.log('\n🎉 Setup complete!')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

