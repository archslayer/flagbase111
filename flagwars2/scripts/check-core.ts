import { config } from 'dotenv'
config({ path: '.env.local' })

import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

async function main() {
  const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
  const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

  console.log('CORE:', CORE)
  console.log('RPC:', RPC)
  console.log('')

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  const ABI = parseAbi([
    'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
    'function remainingSupply(uint256 id) view returns (uint256)'
  ])

  const ids = [90, 44, 1]
  
  for (const id of ids) {
    try {
      const result = await client.readContract({
        address: CORE,
        abi: ABI,
        functionName: 'countries',
        args: [BigInt(id)]
      })
      
      console.log(`Country ${id}:`, result)
    } catch (error: any) {
      console.log(`Country ${id} ERROR:`, error.message)
    }
  }
}

main().catch(console.error)
