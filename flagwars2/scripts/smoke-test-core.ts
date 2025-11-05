import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { config } from 'dotenv'
config({ path: '.env.local' })

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)',
  'function quoteBuy(uint256 id, uint256 amount18) view returns (uint256 grossUSDC6, uint256 feeUSDC6, uint256 netUSDC6)',
  'function quoteSell(uint256 id, uint256 amount18) view returns (uint256 grossUSDC6, uint256 feeUSDC6, uint256 netUSDC6)',
  'function paused() view returns (bool)',
  'function USDC() view returns (address)',
  'function TREASURY() view returns (address)'
])

async function main() {
  console.log('=== SMOKE TEST: NEW CORE CONTRACT ===\n')
  console.log('CORE_ADDRESS:', CORE)
  console.log('RPC:', RPC)
  console.log('')

  // 1) Check Core status
  console.log('1) Checking Core status...')
  const paused = await client.readContract({ address: CORE, abi: ABI, functionName: 'paused' })
  const usdc = await client.readContract({ address: CORE, abi: ABI, functionName: 'USDC' })
  const treasury = await client.readContract({ address: CORE, abi: ABI, functionName: 'TREASURY' })
  console.log('   Paused:', paused)
  console.log('   USDC:', usdc)
  console.log('   Treasury:', treasury)
  console.log('')

  // 2) Check countries exist
  console.log('2) Checking countries...')
  const testCountries = [90, 44, 1] // TR, UK, US
  
  for (const id of testCountries) {
    try {
      const result = await client.readContract({
        address: CORE,
        abi: ABI,
        functionName: 'countries',
        args: [BigInt(id)]
      }) as any
      
      const name = result[0]
      const exists = result[2]
      const price8 = result[3]
      const kappa8 = result[4]
      const lambda8 = result[5]
      const priceMin8 = result[6]
      
      const remaining = await client.readContract({
        address: CORE,
        abi: ABI,
        functionName: 'remainingSupply',
        args: [BigInt(id)]
      })

      console.log(`   Country ${id} (${name}):`)
      console.log(`     Exists: ${exists}`)
      console.log(`     Price8: ${price8}`)
      console.log(`     Kappa8: ${kappa8}`)
      console.log(`     Lambda8: ${lambda8}`)
      console.log(`     PriceMin8: ${priceMin8}`)
      console.log(`     Remaining: ${remaining}`)
      console.log('')
      
      // 3) Test quoteBuy for 1 token
      if (exists) {
        const [gross, fee, net] = await client.readContract({
          address: CORE,
          abi: ABI,
          functionName: 'quoteBuy',
          args: [BigInt(id), BigInt('1000000000000000000')] // 1 token
        }) as [bigint, bigint, bigint]
        
        console.log(`     Quote BUY 1 token:`)
        console.log(`       Gross: ${gross} USDC6`)
        console.log(`       Fee: ${fee} USDC6`)
        console.log(`       Net: ${net} USDC6`)
        console.log('')
      }
    } catch (error: any) {
      console.error(`   Country ${id} error:`, error.message)
    }
  }

  console.log('=== SMOKE TEST COMPLETE ===')
}

main().catch(console.error)
