// scripts/fund-core-with-tokens-and-usdc.ts
// Core kontratına token ve USDC gönderir (buy/sell işlemleri için)

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
if (!USDC) {
  throw new Error('NEXT_PUBLIC_USDC_ADDRESS not set in .env.local')
}
if (!DEPLOYER_PK) {
  throw new Error('DEPLOYER_PRIVATE_KEY or DEPLOYER_PK not set in .env.local')
}

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// ERC20 ABI
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
])

async function transferTokens(
  publicClient: any,
  walletClient: any,
  tokenAddress: `0x${string}`,
  tokenName: string,
  to: `0x${string}`,
  amount: bigint,
  from: `0x${string}`
) {
  try {
    // Check balance
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [from]
    }) as bigint

    console.log(`\n${tokenName}:`)
    console.log(`  From balance: ${balance.toString()}`)
    console.log(`  Amount to transfer: ${amount.toString()}`)

    if (balance < amount) {
      console.log(`  ⚠️  Insufficient balance - need ${amount.toString()}, have ${balance.toString()}`)
      return { success: false, reason: 'insufficient_balance' }
    }

    // Transfer
    console.log(`  ⏳ Transferring to Core...`)
    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount]
    })

    console.log(`  Transaction hash: ${hash}`)
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ✅ Transferred! (Block: ${receipt.blockNumber})`)

    // Verify
    const newBalance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [to]
    }) as bigint

    console.log(`  Core balance: ${newBalance.toString()}`)

    return { success: true, hash }
  } catch (e: any) {
    console.error(`  ❌ Error:`, e.message)
    return { success: false, error: e.message }
  }
}

async function main() {
  console.log('💰 Funding Core contract with tokens and USDC...\n')
  console.log('Core:', CORE)
  console.log('USDC:', USDC)
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

  const results: Record<string, any> = {}

  // 1. Transfer country tokens to Core (50,000 tokens each = 50,000 * 1e18)
  const TOKENS_PER_COUNTRY = parseUnits('50000', 18) // 50,000 tokens

  if (TOKEN_TR && TOKEN_UK && TOKEN_US) {
    console.log('='.repeat(60))
    console.log('1. TRANSFERRING COUNTRY TOKENS TO CORE')
    console.log('='.repeat(60))
    console.log(`Amount per country: ${formatUnits(TOKENS_PER_COUNTRY, 18)} tokens\n`)

    const tokens = [
      { address: TOKEN_TR, name: 'Turkey Token' },
      { address: TOKEN_UK, name: 'UK Token' },
      { address: TOKEN_US, name: 'US Token' }
    ]

    for (const token of tokens) {
      results[token.name.toLowerCase().replace(' ', '_')] = await transferTokens(
        publicClient,
        wallet,
        token.address,
        token.name,
        CORE,
        TOKENS_PER_COUNTRY,
        deployerAddress
      )
      
      // Small delay to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  } else {
    console.log('⚠️  Country token addresses not set - skipping token transfers')
  }

  // 2. Transfer USDC to Core (for sell operations)
  // Transfer enough USDC to cover initial sells (e.g., 10,000 USDC = 10,000 * 1e6)
  const USDC_AMOUNT = parseUnits('10000', 6) // 10,000 USDC (6 decimals)

  console.log('\n' + '='.repeat(60))
  console.log('2. TRANSFERRING USDC TO CORE')
  console.log('='.repeat(60))
  console.log(`Amount: ${formatUnits(USDC_AMOUNT, 6)} USDC\n`)

  results.usdc = await transferTokens(
    publicClient,
    wallet,
    USDC,
    'USDC',
    CORE,
    USDC_AMOUNT,
    deployerAddress
  )

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📋 SUMMARY')
  console.log('='.repeat(60))
  
  if (TOKEN_TR && TOKEN_UK && TOKEN_US) {
    const tokenResults = [
      { name: 'Turkey Token', key: 'turkey_token' },
      { name: 'UK Token', key: 'uk_token' },
      { name: 'US Token', key: 'us_token' }
    ]

    for (const token of tokenResults) {
      const result = results[token.key]
      if (result) {
        console.log(`\n${token.name}:`)
        if (result.success) {
          console.log(`  ✅ Transferred successfully`)
        } else {
          console.log(`  ❌ Failed: ${result.reason || result.error}`)
        }
      }
    }
  }

  console.log('\nUSDC:')
  if (results.usdc.success) {
    console.log(`  ✅ Transferred successfully`)
  } else {
    console.log(`  ❌ Failed: ${results.usdc.reason || results.usdc.error}`)
  }

  console.log('\n🎉 Done!')
  console.log('\nNext steps:')
  console.log('  1. Verify Core balances:')
  console.log(`     - Country tokens: ${formatUnits(TOKENS_PER_COUNTRY, 18)} each`)
  console.log(`     - USDC: ${formatUnits(USDC_AMOUNT, 6)}`)
  console.log('  2. Test buy/sell operations')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

