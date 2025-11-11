// scripts/setup-treasury-allowances.ts
// Treasury'nin Core'a USDC ve country token'ları için allowance vermesi

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const TREASURY_PK = process.env.TREASURY_PRIVATE_KEY as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE) {
  throw new Error('NEXT_PUBLIC_CORE_ADDRESS not set in .env.local')
}
if (!USDC) {
  throw new Error('NEXT_PUBLIC_USDC_ADDRESS not set in .env.local')
}
if (!TREASURY_PK) {
  throw new Error('TREASURY_PRIVATE_KEY not set in .env.local')
}

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// ERC20 ABI
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
])

async function checkAndApprove(
  publicClient: any,
  walletClient: any,
  tokenAddress: `0x${string}`,
  tokenName: string,
  owner: `0x${string}`,
  spender: `0x${string}`
) {
  try {
    // Check balance
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner]
    }) as bigint

    console.log(`\n${tokenName}:`)
    console.log(`  Balance: ${balance.toString()}`)

    if (balance === 0n) {
      console.log(`  ⚠️  Treasury has no ${tokenName} balance - skipping approval`)
      return { approved: false, reason: 'no_balance' }
    }

    // Check current allowance
    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender]
    }) as bigint

    console.log(`  Current allowance: ${allowance.toString()}`)

    // If already approved (max or sufficient), skip
    const MAX_UINT256 = 2n ** 256n - 1n
    if (allowance >= MAX_UINT256 / 2n) {
      console.log(`  ✅ Already approved (max or sufficient)`)
      return { approved: true, alreadyApproved: true }
    }

    // Approve max
    console.log(`  ⏳ Approving max allowance...`)
    const hash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, MAX_UINT256]
    })

    console.log(`  Transaction hash: ${hash}`)
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  ✅ Approved! (Block: ${receipt.blockNumber})`)

    // Verify
    const newAllowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender]
    }) as bigint

    console.log(`  New allowance: ${newAllowance.toString()}`)

    return { approved: true, alreadyApproved: false, hash }
  } catch (e: any) {
    console.error(`  ❌ Error:`, e.message)
    return { approved: false, error: e.message }
  }
}

async function main() {
  console.log('💰 Setting up Treasury allowances for Core contract...\n')
  console.log('Treasury:', privateKeyToAccount(TREASURY_PK as `0x${string}`).address)
  console.log('Core:', CORE)
  console.log('USDC:', USDC)
  console.log('')

  const account = privateKeyToAccount(TREASURY_PK as `0x${string}`)
  const treasuryAddress = account.address

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

  // 1. USDC allowance (for sell operations - Core needs to pull USDC from Treasury)
  console.log('='.repeat(60))
  console.log('1. USDC ALLOWANCE (for sell operations)')
  console.log('='.repeat(60))
  results.usdc = await checkAndApprove(
    publicClient,
    wallet,
    USDC,
    'USDC',
    treasuryAddress,
    CORE
  )

  // 2. Country token allowances (for sell operations - Core needs to pull tokens from Treasury)
  if (TOKEN_TR && TOKEN_UK && TOKEN_US) {
    console.log('\n' + '='.repeat(60))
    console.log('2. COUNTRY TOKEN ALLOWANCES (for sell operations)')
    console.log('='.repeat(60))

    const tokens = [
      { address: TOKEN_TR, name: 'Turkey Token' },
      { address: TOKEN_UK, name: 'UK Token' },
      { address: TOKEN_US, name: 'US Token' }
    ]

    for (const token of tokens) {
      results[token.name.toLowerCase().replace(' ', '_')] = await checkAndApprove(
        publicClient,
        wallet,
        token.address,
        token.name,
        treasuryAddress,
        CORE
      )
      
      // Small delay to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  } else {
    console.log('\n⚠️  Country token addresses not set - skipping token approvals')
    console.log('   Set TURKEY_TOKEN_ADDRESS, UK_TOKEN_ADDRESS, US_TOKEN_ADDRESS in .env.local')
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📋 SUMMARY')
  console.log('='.repeat(60))
  
  console.log('\nUSDC:')
  if (results.usdc.approved) {
    console.log(`  ✅ ${results.usdc.alreadyApproved ? 'Already approved' : 'Approved successfully'}`)
  } else {
    console.log(`  ❌ Failed: ${results.usdc.reason || results.usdc.error}`)
  }

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
        if (result.approved) {
          console.log(`  ✅ ${result.alreadyApproved ? 'Already approved' : 'Approved successfully'}`)
        } else {
          console.log(`  ❌ Failed: ${result.reason || result.error}`)
        }
      }
    }
  }

  console.log('\n🎉 Done!')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

