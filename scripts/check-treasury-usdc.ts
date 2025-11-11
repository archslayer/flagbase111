import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(process.cwd(), '.env.local') })

import { publicClient, getTreasuryAddress } from '../lib/viem/clients'
import type { Address } from 'viem'

const USDC_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

async function checkBalance() {
  try {
    const USDC = (process.env.CLAIM_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS) as Address
    const treasury = getTreasuryAddress()

    console.log('Checking treasury USDC balance...')
    console.log('  Treasury:', treasury)
    console.log('  USDC:', USDC)
    console.log('')

    const decimals = await publicClient.readContract({
      address: USDC,
      abi: USDC_ABI,
      functionName: 'decimals'
    })

    const balance = await publicClient.readContract({
      address: USDC,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [treasury]
    })

    const balanceUsdc = (balance / 1000000n).toString()
    const cents = (balance % 1000000n).toString().padStart(6, '0').slice(0, 2)

    console.log(`✅ Decimals: ${decimals}`)
    console.log(`✅ Balance: ${balanceUsdc}.${cents} USDC`)
    console.log(`   (${balance.toString()} micro-USDC)`)
    console.log('')

    if (balance === 0n) {
      console.log('⚠️  WARNING: Treasury has 0 USDC!')
      console.log('   Fund treasury to process claims.')
      console.log('   Base Sepolia faucet: https://faucet.circle.com/')
    } else {
      console.log('✅ Treasury funded and ready!')
    }

  } catch (error: any) {
    console.error('❌ Error:', error?.message || error)
    process.exit(1)
  }
}

checkBalance()

