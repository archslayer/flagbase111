/**
 * Check mint conditions for debugging
 */

import dotenv from 'dotenv'
import { createPublicClient, http, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

dotenv.config({ path: '.env.local' })

const ACHIEVEMENTS_SBT_ADDRESS = process.env.NEXT_PUBLIC_ACHIEVEMENTS_SBT_ADDRESS as `0x${string}`
const SIGNER_PRIVATE_KEY = process.env.ACHV_SIGNER_PRIVATE_KEY as `0x${string}`
const TEST_WALLET = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16' as `0x${string}`
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`
const RPC_URL = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA

async function main() {
  console.log('🔍 Checking Mint Conditions...\n')

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  })

  const SBT_ABI = [
    {
      inputs: [{ name: 'category', type: 'uint256' }, { name: 'level', type: 'uint256' }],
      name: 'validLevels',
      outputs: [{ type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'signer',
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ name: 'user', type: 'address' }, { name: 'category', type: 'uint256' }, { name: 'level', type: 'uint256' }],
      name: 'minted',
      outputs: [{ type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  // 1. Check validLevels
  console.log('1. Checking validLevels(1, 1)...')
  const validLevel = await publicClient.readContract({
    address: ACHIEVEMENTS_SBT_ADDRESS,
    abi: SBT_ABI,
    functionName: 'validLevels',
    args: [1, 1],
  })
  console.log(`   Result: ${validLevel} ${validLevel ? '✅' : '❌'}\n`)

  // 2. Check contract signer
  console.log('2. Checking contract signer...')
  const contractSigner = await publicClient.readContract({
    address: ACHIEVEMENTS_SBT_ADDRESS,
    abi: SBT_ABI,
    functionName: 'signer',
  })
  console.log(`   Contract signer: ${contractSigner}\n`)

  // 3. Check backend signer address
  console.log('3. Checking backend signer address...')
  const backendSignerAccount = privateKeyToAccount(SIGNER_PRIVATE_KEY)
  const backendSignerAddress = backendSignerAccount.address
  console.log(`   Backend signer: ${backendSignerAddress}\n`)

  // 4. Check if addresses match
  console.log('4. Checking if addresses match...')
  const addressesMatch = contractSigner.toLowerCase() === backendSignerAddress.toLowerCase()
  console.log(`   Match: ${addressesMatch} ${addressesMatch ? '✅' : '❌'}\n`)

  // 5. Check if already minted
  console.log('5. Checking if already minted...')
  const alreadyMinted = await publicClient.readContract({
    address: ACHIEVEMENTS_SBT_ADDRESS,
    abi: SBT_ABI,
    functionName: 'minted',
    args: [TEST_WALLET, 1, 1],
  })
  console.log(`   Already minted: ${alreadyMinted} ${alreadyMinted ? '⚠️ ' : '✅'}\n`)

  // 6. Check USDC allowance
  console.log('6. Checking USDC allowance...')
  const USDC_ABI = [
    {
      inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
      name: 'allowance',
      outputs: [{ type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [TEST_WALLET, ACHIEVEMENTS_SBT_ADDRESS],
  })
  console.log(`   Allowance: ${allowance.toString()} (need 200000)\n`)

  // Summary
  console.log('=== SUMMARY ===\n')
  
  if (!validLevel) {
    console.log('❌ validLevels(1, 1) is FALSE')
    console.log('   Fix: await sbt.setValidLevel(1, 1, true)')
  } else {
    console.log('✅ validLevels(1, 1) is TRUE')
  }

  if (!addressesMatch) {
    console.log('❌ Signer addresses do NOT match')
    console.log(`   Contract: ${contractSigner}`)
    console.log(`   Backend:  ${backendSignerAddress}`)
    console.log('   Fix: Update signer on contract or .env')
  } else {
    console.log('✅ Signer addresses match')
  }

  if (alreadyMinted) {
    console.log('⚠️  Already minted')
    console.log('   Fix: Choose different category/level')
  } else {
    console.log('✅ Not minted yet')
  }

  if (allowance < BigInt(200000)) {
    console.log('❌ USDC allowance insufficient')
    console.log('   Fix: Approve USDC in UI')
  } else {
    console.log('✅ USDC allowance sufficient')
  }
}

main().catch(console.error)

