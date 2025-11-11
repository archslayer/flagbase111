import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { getRedis } from '@/lib/redis'

export const runtime = 'nodejs'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({ 
  chain: baseSepolia, 
  transport: http(RPC, { 
    batch: true,
    timeout: 20000,
    retryCount: 1
  })
})

const ABI = parseAbi([
  'function getCountryInfo(uint256 id) view returns (string, address, uint256, uint256, uint256, bool)'
])

const ALL_COUNTRY_IDS = Array.from({ length: 35 }, (_, i) => i + 1)

/**
 * GET /api/profile/poll-prices
 * 
 * Background job to poll all country prices and cache in Redis.
 * Called periodically (every 2-5 seconds) or on-demand.
 */
export async function GET(req: NextRequest) {
  try {
    const redisClient = await getRedis()
    if (!redisClient) {
      return NextResponse.json(
        { ok: false, error: 'REDIS_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // Build multicall for all countries
    const calls = ALL_COUNTRY_IDS.map(id => ({
      address: CORE_ADDRESS,
      abi: ABI,
      functionName: 'getCountryInfo' as const,
      args: [BigInt(id)]
    }))

    const results = await client.multicall({ 
      contracts: calls, 
      allowFailure: true 
    })

    // Update Redis cache
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const countryId = ALL_COUNTRY_IDS[i]
      
      if (result.status === 'success' && result.result) {
        const price8 = result.result[2] // price8 is the 3rd element
        // Convert PRICE8 to USDC6 for storage (price8 / 100)
        const priceUSDC6 = Number(price8) / 100
        
        await redisClient.set(`price:${countryId}`, String(priceUSDC6), { EX: 5 })
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Prices cached',
      countries: ALL_COUNTRY_IDS.length
    })
  } catch (error: any) {
    console.error('[API /profile/poll-prices] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'POLL_FAILED' },
      { status: 500 }
    )
  }
}

