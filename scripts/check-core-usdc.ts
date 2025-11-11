import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

async function main() {
  console.log('🔍 Checking Core USDC balance...')
  console.log('  Core:', CORE_ADDRESS)
  console.log('  USDC:', USDC_ADDRESS)
  
  const [balance, decimals] = await Promise.all([
    pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [CORE_ADDRESS] }),
    pub.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'decimals' }),
  ])
  
  console.log('\n📊 Results:')
  console.log('  Raw balance:', balance.toString())
  console.log('  Decimals:', decimals)
  console.log('  Formatted:', formatUnits(balance as bigint, decimals as number), 'USDC')
  
  if ((balance as bigint) === 0n) {
    console.log('\n❌ Core has NO USDC! SELL transactions will revert.')
    console.log('   Action: Send USDC to Core contract')
  } else {
    console.log('\n✅ Core has USDC for SELL operations')
  }
}

main().catch(console.error)

