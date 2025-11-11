import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { toChecksumAddress } from '@/lib/validate'

export const runtime = 'edge' // Low latency, fast cold-start

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({ 
  chain: baseSepolia, 
  transport: http(RPC, { 
    batch: true,
    timeout: 20000, // 20 second timeout for larger batches
    retryCount: 1 // Reduce retries to avoid long waits
  })
})

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)'
])

export async function POST(req: NextRequest) {
  try {
    const { ids, wallet } = await req.json() as { ids: number[]; wallet: string }
    
    if (!ids?.length || !wallet) {
      return NextResponse.json({ ok: false, error: 'Missing ids or wallet' }, { status: 400 })
    }

    // Validate and checksum wallet address
    let checksummedWallet: `0x${string}`
    try {
      checksummedWallet = toChecksumAddress(wallet)
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid wallet address' }, { status: 400 })
    }

    // Build multicall: get token addresses, then balances
    const countryCalls = ids.map(id => ({
      address: CORE_ADDRESS,
      abi: ABI,
      functionName: 'countries' as const,
      args: [BigInt(id)]
    }))

    const countryResults = await client.multicall({ 
      contracts: countryCalls, 
      allowFailure: true 
    })

    // Extract token addresses and query balances
    const balanceCalls = countryResults.map((result, i) => {
      if (result.status === 'success') {
        const tokenAddr = result.result[1] as `0x${string}`
        return {
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'balanceOf' as const,
          args: [checksummedWallet]
        }
      }
      return null
    }).filter(Boolean) as any[]

    const balanceResults = await client.multicall({ 
      contracts: balanceCalls, 
      allowFailure: true 
    })

    return NextResponse.json({
      ok: true,
      items: ids.map((id, i) => {
        const countryResult = countryResults[i]
        const balanceResult = balanceResults[i]
        
        // Skip if country doesn't exist or failed to fetch
        if (!countryResult || countryResult.status !== 'success') {
          return null
        }

        const countryData = countryResult.result as any
        const name = countryData[0]
        const exists = countryData[2]
        const price8 = countryData[3]
        const balance18 = balanceResult?.status === 'success' ? (balanceResult.result as bigint) : 0n
        
        if (!exists) return null
        
        return {
          id,
          name,
          balance18: balance18.toString(),
          price8: price8.toString(),
          exists
        }
      }).filter(item => item !== null && item.exists) // Only return existing countries
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10'
      }
    })

  } catch (error: any) {
    console.error('[API /countries/userBalances] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'RPC_ERROR' },
      { status: 500 }
    )
  }
}

