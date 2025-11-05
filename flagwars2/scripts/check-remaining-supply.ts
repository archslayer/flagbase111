import { config } from 'dotenv'
config({ path: '.env.local' })

import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pc = createPublicClient({ chain: baseSepolia, transport: http(rpc) })
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS

const abi = [
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'remainingSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
    name: 'getCountryInfo',
    outputs: [
      { internalType: 'string', name: '', type: 'string' },
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'bool', name: '', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const

async function main() {
  const countries = [1, 44, 90]
  
  for (const id of countries) {
    try {
      const info = await pc.readContract({
        address: CORE as `0x${string}`,
        abi,
        functionName: 'getCountryInfo',
        args: [BigInt(id)]
      })
      
      const [name, , , totalSupply, , exists] = info
      
      let remaining: bigint = 0n
      try {
        remaining = await pc.readContract({
          address: CORE as `0x${string}`,
          abi,
          functionName: 'remainingSupply',
          args: [BigInt(id)]
        })
      } catch (e: any) {
        console.log(`  ⚠️  remainingSupply reverted: ${e.message}`)
      }
      
      console.log(`${name} (ID: ${id}):`)
      console.log(`  Exists: ${exists}`)
      console.log(`  Total Supply: ${totalSupply.toString()}`)
      console.log(`  Remaining Supply: ${remaining.toString()}`)
      console.log('')
    } catch (e: any) {
      console.error(`Country ${id}:`, e.message)
    }
  }
}

main().catch(console.error)
