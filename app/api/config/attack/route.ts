import { NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

export const runtime = 'edge'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({ 
  chain: baseSepolia, 
  transport: http(RPC) 
})

const ABI = parseAbi([
  'function cfg() view returns (address payToken, address feeToken, address treasury, address revenue, address commissions, uint16 buyFeeBps, uint16 sellFeeBps, uint16 referralShareBps, uint16 revenueShareBps, uint64 priceMin8, uint64 kappa, uint64 lambda, bool attackFeeInUSDC, uint64 tier1Price8, uint64 tier2Price8, uint64 tier3Price8, uint64 delta1_8, uint64 delta2_8, uint64 delta3_8, uint64 delta4_8, uint32 fee1_USDC6, uint32 fee2_USDC6, uint32 fee3_USDC6, uint32 fee4_USDC6, uint256 fee1_TOKEN18, uint256 fee2_TOKEN18, uint256 fee3_TOKEN18, uint256 fee4_TOKEN18)'
])

export async function GET() {
  try {
    // Try to read cfg() from old contract, but fallback to defaults if it doesn't exist
    let cfg: any;
    try {
      cfg = await client.readContract({
        address: CORE_ADDRESS,
        abi: ABI,
        functionName: 'cfg'
      })
    } catch (cfgError: any) {
      console.log('[API /config/attack] cfg() not available, using defaults:', cfgError?.message)
      cfg = null; // cfg() doesn't exist in new Core.sol
    }

    // Return config with fallback to defaults
    return NextResponse.json({
      ok: true,
      config: {
        attackFeeInUSDC: cfg ? cfg[12] : true, // Always USDC for attacks
        tier1Price8: cfg ? cfg[13].toString() : "100000000",     // 1 USDC (1e8)
        tier2Price8: cfg ? cfg[14].toString() : "1000000000",    // 10 USDC (1e9)
        tier3Price8: cfg ? cfg[15].toString() : "10000000000",   // 100 USDC (1e10)
        delta1_8: cfg ? cfg[16].toString() : "0",
        delta2_8: cfg ? cfg[17].toString() : "0",
        delta3_8: cfg ? cfg[18].toString() : "0",
        delta4_8: cfg ? cfg[19].toString() : "0",
        fee1_USDC6: cfg ? cfg[20] : 100000,  // 0.1 USDC
        fee2_USDC6: cfg ? cfg[21] : 500000,  // 0.5 USDC
        fee3_USDC6: cfg ? cfg[22] : 1000000, // 1 USDC
        fee4_USDC6: cfg ? cfg[23] : 2000000, // 2 USDC
        fee1_TOKEN18: cfg ? cfg[24].toString() : "0",
        fee2_TOKEN18: cfg ? cfg[25].toString() : "0",
        fee3_TOKEN18: cfg ? cfg[26].toString() : "0",
        fee4_TOKEN18: cfg ? cfg[27].toString() : "0"
      }
    }, {
      headers: {
        // Config rarely changes - cache aggressively
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })

  } catch (error: any) {
    console.error('[API /config/attack] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'RPC_ERROR' },
      { status: 500 }
    )
  }
}

