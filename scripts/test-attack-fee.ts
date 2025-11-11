import { createPublicClient, http, parseAbi, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = getAddress(process.env.NEXT_PUBLIC_CORE_ADDRESS!)
const TEST_USER = getAddress('0xc32e33f743Cf7f95D90d1392771632fF1640dE16')

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const coreAbi = parseAbi([
  'function previewAttackFee(address user, uint256 attackerPrice8) view returns (uint256 baseFeeUSDC6, uint256 appliedTier, uint256 appliedMulBps, uint256 finalFeeUSDC6, bool isFreeAttackAvailable)',
])

async function main() {
  console.log('🧪 Attack Fee Calculation Test\n')
  console.log('📍 Core:', CORE_ADDRESS)
  console.log('📍 Test User:', TEST_USER)
  console.log()

  const testCases = [
    { price: 0.5, price8: 0.5e8, expectedTier: 1, expectedFee: 0.1 },
    { price: 1, price8: 1e8, expectedTier: 2, expectedFee: 0.5 },
    { price: 5, price8: 5e8, expectedTier: 2, expectedFee: 0.5 },
    { price: 10, price8: 10e8, expectedTier: 3, expectedFee: 1.0 },
    { price: 50, price8: 50e8, expectedTier: 3, expectedFee: 1.0 },
    { price: 100, price8: 100e8, expectedTier: 4, expectedFee: 2.0 },
    { price: 500, price8: 500e8, expectedTier: 4, expectedFee: 2.0 },
  ]

  for (const test of testCases) {
    try {
      const result = await pub.readContract({
        address: CORE_ADDRESS,
        abi: coreAbi,
        functionName: 'previewAttackFee',
        args: [TEST_USER, BigInt(test.price8)]
      }) as [bigint, bigint, bigint, bigint, boolean]

      const [baseFee, tier, mulBps, finalFee, isFree] = result
      const actualFee = Number(finalFee) / 1e6
      const match = tier === BigInt(test.expectedTier) && actualFee === test.expectedFee

      console.log(`Price: ${test.price} USDC`)
      console.log(`  Expected: Tier ${test.expectedTier}, Fee ${test.expectedFee} USDC`)
      console.log(`  Actual:   Tier ${tier}, Fee ${actualFee} USDC`)
      console.log(`  MulBps: ${mulBps} (${mulBps === 0n ? 'No WB' : 'WB applied'})`)
      console.log(`  ${match ? '✅ PASS' : '❌ FAIL'}`)
      console.log()
    } catch (e: any) {
      console.log(`Price: ${test.price} USDC`)
      console.log(`  ❌ ERROR: ${e.message}`)
      console.log()
    }
  }

  console.log('📊 Summary:')
  console.log('  - Tier 1 (< 1 USDC): 0.1 USDC fee')
  console.log('  - Tier 2 (1-10 USDC): 0.5 USDC fee')
  console.log('  - Tier 3 (10-100 USDC): 1 USDC fee')
  console.log('  - Tier 4 (≥ 100 USDC): 2 USDC fee')
  console.log('  - WB multipliers: Not implemented yet (all should be 0)')
}

main().catch(console.error)

