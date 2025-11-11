import { createPublicClient, http, parseAbi, getAddress, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = getAddress(process.env.NEXT_PUBLIC_CORE_ADDRESS!)
const TEST_USER = getAddress('0xc32e33f743Cf7f95D90d1392771632fF1640dE16')

const ALL_FLAGS = [
  { id: 90, name: "Turkey", code: "TR" },
  { id: 44, name: "United Kingdom", code: "UK" },
  { id: 1, name: "United States", code: "US" },
]

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const coreAbi = parseAbi([
  'function countries(uint256) view returns (string, address, bool, uint256, uint32, uint32, uint256)',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
])

async function main() {
  console.log('🧪 Attack UI - Owned Flags Test\n')
  console.log('📍 User:', TEST_USER)
  console.log()

  const ownedFlags = []

  for (const flag of ALL_FLAGS) {
    console.log(`Checking ${flag.code} (ID ${flag.id})...`)
    
    try {
      // Get token address from countries mapping
      const country = await pub.readContract({
        address: CORE_ADDRESS,
        abi: coreAbi,
        functionName: 'countries',
        args: [BigInt(flag.id)]
      })
      
      const [name, tokenAddr, exists, price8] = country
      
      if (!exists) {
        console.log('  ❌ Not deployed\n')
        continue
      }
      
      // Get user balance from token contract
      const balance = await pub.readContract({
        address: tokenAddr as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [TEST_USER]
      }) as bigint
      
      const balanceFormatted = formatUnits(balance, 18)
      console.log('  Balance:', balanceFormatted, 'tokens')
      console.log('  Price:', Number(price8) / 1e8, 'USDC')
      
      if (balance > 0n) {
        ownedFlags.push(flag.code)
        console.log('  ✅ OWNED\n')
      } else {
        console.log('  ⚠️ Not owned\n')
      }
      
    } catch (e: any) {
      console.log('  ❌ Error:', e.message, '\n')
    }
  }

  console.log('📊 SUMMARY:')
  if (ownedFlags.length > 0) {
    console.log('  ✅ User owns:', ownedFlags.join(', '))
    console.log('  → Attack page should show these flags as "Your Flags"')
    console.log('  → User can select one as attacker')
  } else {
    console.log('  ❌ User has no flags')
    console.log('  → Attack page will show "No tokens owned" message')
    console.log('  → User needs to buy flags from Market first')
  }
  console.log()
  
  // Test attack fee calculation for owned flags
  if (ownedFlags.length > 0) {
    console.log('💰 Attack Fee Preview (for owned flags):')
    for (const flag of ALL_FLAGS.filter(f => ownedFlags.includes(f.code))) {
      try {
        const country = await pub.readContract({
          address: CORE_ADDRESS,
          abi: coreAbi,
          functionName: 'countries',
          args: [BigInt(flag.id)]
        })
        
        const price8 = country[3] as bigint
        const priceUSDC = Number(price8) / 1e8
        
        // Client-side fee calculation (same as UI)
        let fee: number
        if (price8 > 10e8) {
          fee = 0.40 // Tier 3: > 10 USDC
        } else if (price8 > 5e8) {
          fee = 0.35 // Tier 2: 5.000001 - 10 USDC
        } else {
          fee = 0.30 // Tier 1: ≤ 5 USDC
        }
        
        console.log(`  ${flag.code}: Price ${priceUSDC} USDC → Attack Fee ${fee} USDC`)
      } catch (e) {
        console.log(`  ${flag.code}: Error calculating fee`)
      }
    }
  }
}

main().catch(console.error)

