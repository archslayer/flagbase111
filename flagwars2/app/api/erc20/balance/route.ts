// app/api/erc20/balance/route.ts
// Hızlı USDC balance + allowance endpoint (5 sn cache)
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// In-memory cache (5 sn TTL)
const cache = new Map<string, { t: number, data: any }>()
const TTL_MS = 5000

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const wallet = searchParams.get('wallet')?.toLowerCase()
    
    if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ ok: false, error: 'BAD_WALLET' }, { status: 400 })
    }
    
    const key = `erc20:${wallet}`
    const now = Date.now()
    const hit = cache.get(key)
    
    // Cache hit (5 sn içindeyse)
    if (hit && now - hit.t < TTL_MS) {
      return NextResponse.json({ ok: true, ...hit.data, cached: true })
    }
    
    // Cache miss - multicall ile oku
    const { readUsdcBalAndAllowance } = await import('@/lib/erc20-batch')
    const { balance, allowance } = await readUsdcBalAndAllowance(wallet as `0x${string}`)
    
    const data = { 
      balance: balance.toString(), 
      allowance: allowance.toString() 
    }
    
    cache.set(key, { t: now, data })
    
    return NextResponse.json({ ok: true, ...data, cached: false })
    
  } catch (error: any) {
    console.error('[API /erc20/balance] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'READ_FAILED' },
      { status: 500 }
    )
  }
}

