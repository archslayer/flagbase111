import { config } from 'dotenv'
config({ path: '.env.local' })

import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ABI } from '../lib/core-abi'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pc = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

async function main() {
  try {
    // 1) Check if paused
    const paused = await pc.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'paused'
    })
    console.log('Contract paused:', paused)
    
    // 2) Check ownership
    const owner = await pc.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'owner'
    })
    console.log('Owner:', owner)
    
    // 3) Try to read country
    const info = await pc.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'getCountryInfo',
      args: [90n]
    })
    console.log('Turkey (ID: 90):', info)
    
  } catch (e: any) {
    console.error('Error:', e.message)
  }
}

main()
