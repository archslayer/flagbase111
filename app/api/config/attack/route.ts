import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    return NextResponse.json(
      {
        ok: true,
        config: {
          // Always USDC for attacks
          attackFeeInUSDC: true,
          // Price tiers (USDC * 1e8)
          tier1Price8: '500000000',   // 5.00 USDC
          tier2Price8: '1000000000',  // 10.00 USDC
          tier3Price8: '0',           // No upper bound
          // Attack deltas (1e8)
          delta1_8: '110000',         // 0.0011
          delta2_8: '90000',          // 0.0009
          delta3_8: '70000',          // 0.0007
          delta4_8: '50000',          // 0.0005 (free)
          // Attack fees (USDC6)
          fee1_USDC6: 300000,         // 0.30
          fee2_USDC6: 350000,         // 0.35
          fee3_USDC6: 400000,         // 0.40
          fee4_USDC6: 0,              // free attack
          // Token-based fees not used in static spec
          fee1_TOKEN18: '0',
          fee2_TOKEN18: '0',
          fee3_TOKEN18: '0',
          fee4_TOKEN18: '0'
        }
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    )
  } catch (error: any) {
    console.error('[API /config/attack] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'CONFIG_ERROR' },
      { status: 500 }
    )
  }
}

