import { NextRequest, NextResponse } from 'next/server'
import { coreRead } from '@/lib/core'
import { verifyJwt } from '@/lib/jwt'
import { readUsdcBalance, readUsdcAllowance } from '@/lib/erc20'
import { token18ToUsdc6 } from '@/lib/amount'
import { withIdempotency } from '@/idempotency/handler'

async function quoteHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // JWT auth from cookie
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/fw_session=([^;]+)/)
    let userId = 'anon'
    if (m) {
      try {
        const payload = await verifyJwt(decodeURIComponent(m[1]))
        userId = String(payload.sub || payload.wallet || 'anon')
      } catch {}
    }
    
    if (userId === 'anon') {
      return NextResponse.json({ ok: false, error: 'UNAUTH' }, { status: 401 })
    }

    // Parse request body
    const { countryId, amountToken18, mode } = await req.json()
    
    if (!countryId || !amountToken18 || !mode) {
      return NextResponse.json({ ok: false, error: 'BAD_INPUT' }, { status: 400 })
    }

    const countryIdNum = Number(countryId)
    const amountBigInt = BigInt(amountToken18)

    // Get current country info for price
    const countryInfo = await coreRead.getCountryInfo(countryIdNum)
    if (!countryInfo.exists) {
      return NextResponse.json({ ok: false, error: 'COUNTRY_NOT_FOUND' }, { status: 400 })
    }

    // Calculate USDC total based on current price
    const price8 = countryInfo.price8
    const usdcTotal = mode === 'buy' 
      ? token18ToUsdc6(amountBigInt, price8)
      : token18ToUsdc6(amountBigInt, price8)

    // Get user USDC balance and allowance
    const userAddress = userId as `0x${string}`
    const userUsdcBal = await readUsdcBalance(userAddress)
    const allowance = await readUsdcAllowance(userAddress)

    // Calculate slippage (2% default)
    const slippageBps = 200 // 2%
    const slippageMax = (usdcTotal * BigInt(10000 + slippageBps)) / 10000n

    const allowanceShortage = allowance < usdcTotal
    const needApproval = allowanceShortage

    return NextResponse.json({
      ok: true,
      price8: price8.toString(),
      usdcTotal: usdcTotal.toString(),
      slippageMax: slippageMax.toString(),
      userUsdcBal: userUsdcBal.toString(),
      needApproval,
      allowanceShortage
    })

  } catch (e: any) {
    console.error('Quote error:', e)
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'QUOTE_FAILED' 
    }, { status: 500 })
  }
}

export const POST = withIdempotency(quoteHandler)
