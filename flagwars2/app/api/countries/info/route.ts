import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
})

const ABI = parseAbi([
  // New Core.sol: countries mapping
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)'
])

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idStr = searchParams.get('id')
    
    if (!idStr) {
      return NextResponse.json({ ok: false, error: 'Missing id parameter' }, { status: 400 })
    }
    
    const countryId = BigInt(idStr)
    
    // Read countries mapping from new Core.sol
    const result = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: ABI,
      functionName: 'countries',
      args: [countryId]
    })
    
    // result is {name, token, exists, price8, kappa8, lambda8, priceMin8}
    const name = result.name
    const tokenAddress = result.token
    const exists = result.exists
    const price8 = result.price8
    
    if (!exists) {
      return NextResponse.json({ ok: false, error: 'Country not found' }, { status: 404 })
    }
    
    // Get remaining supply
    const remaining = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: ABI,
      functionName: 'remainingSupply',
      args: [countryId]
    })
    
    const response = NextResponse.json({
      ok: true,
      name,
      tokenAddress,
      price8: price8.toString(),
      totalSupply: remaining.toString(),
      exists
    })
    
    // NO CACHE - always fetch fresh data
    response.headers.set('Cache-Control', 'no-store, must-revalidate')
    return response
    
  } catch (error: any) {
    console.error('[API /countries/info] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'FETCH_FAILED' },
      { status: 500 }
    )
  }
}

