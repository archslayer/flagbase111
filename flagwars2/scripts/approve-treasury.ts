import { config } from 'dotenv'
config({ path: '.env.local' })

import { createWalletClient, createPublicClient, http, parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const TREASURY_PK = process.env.TREASURY_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Hardhat default
const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

// TOKEN ADDRESSES - UPDATE THESE AFTER DEPLOY
const TOKENS = {
  90: process.env.TOKEN_TR_ADDRESS as `0x${string}`, // Turkey
  44: process.env.TOKEN_UK_ADDRESS as `0x${string}`, // UK
  1: process.env.TOKEN_US_ADDRESS as `0x${string}`  // US
}

const abi = [
  {
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ type: 'address' }, { type: 'address' }],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

async function main() {
  const account = privateKeyToAccount(TREASURY_PK as `0x${string}`)
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpc)
  })
  const walletClient = createWalletClient({ 
    account,
    chain: baseSepolia,
    transport: http(rpc)
  })

  console.log('Treasury:', account.address)
  console.log('Core:', CORE_ADDRESS)
  console.log('')

  for (const [id, token] of Object.entries(TOKENS)) {
    if (!token || token === 'undefined') {
      console.log(`⚠️  Token ${id}: Not set in env (TOKEN_TR/US/UK_ADDRESS)`)
      continue
    }

    console.log(`\nCountry ${id} (Token: ${token})`)
    
    try {
      // Check balance
      const balance = await publicClient.readContract({
        address: token,
        abi,
        functionName: 'balanceOf',
        args: [account.address]
      })
      console.log(`  Balance: ${balance.toString()}`)

      // Check allowance
      const allowance = await publicClient.readContract({
        address: token,
        abi,
        functionName: 'allowance',
        args: [account.address, CORE_ADDRESS]
      })
      console.log(`  Current allowance: ${allowance.toString()}`)

      if (allowance === 0n) {
        console.log('  ⏳ Approving...')
        const hash = await walletClient.writeContract({
          address: token,
          abi,
          functionName: 'approve',
          args: [CORE_ADDRESS, 2n**256n - 1n] // Max
        })
        console.log(`  ✅ Approval sent: ${hash}`)
      } else {
        console.log('  ✅ Already approved')
      }
    } catch (e: any) {
      console.error(`  ❌ Error:`, e.message)
    }
  }

  console.log('\n✅ Done!')
}

main().catch(console.error)
