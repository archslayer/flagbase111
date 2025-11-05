import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { toChecksumAddress } from '@/lib/validate'
import { CORE_ADDRESS } from '@/lib/addresses'
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
})

const CORE_ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)'
])

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idStr = searchParams.get('id')
    const walletStr = searchParams.get('wallet')
    
    if (!idStr || !walletStr) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing id or wallet parameter' 
      }, { status: 400 })
    }
    
    // Validate and checksum wallet address
    let wallet: `0x${string}`
    try {
      wallet = toChecksumAddress(walletStr)
    } catch (e: any) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid wallet address' 
      }, { status: 400 })
    }
    
    const countryId = BigInt(idStr)
    
    // 1) Get token address from countries mapping (new Core structure)
    const result = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'countries',
      args: [countryId]
    }) as any
    
    // Extract token address (index 1 in the result array)
    const tokenAddr = result[1] as `0x${string}`
    
    // 2) Read ERC20 balance from token contract
    const balance18 = await publicClient.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [wallet]
    })
    
    return NextResponse.json({
      ok: true,
      balance18: balance18.toString(),
      countryId: countryId.toString(),
      wallet
    })
    
  } catch (error: any) {
    console.error('[API /countries/userBalance] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'FETCH_FAILED' },
      { status: 500 }
    )
  }
}

