// app/api/adminfb/market/route.ts
// Admin market prices endpoint

import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/jwt'
import { getAllLatestCorePrices } from '@/lib/indexer/corePricesPoller'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/market
 * Get current market prices from indexer
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin session
    const token = req.cookies.get('fw_admin_session')?.value
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyJwt(token)
    if (!payload.admin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 })
    }

    // Get prices from indexer
    const prices = getAllLatestCorePrices()

    // Format prices
    const formattedPrices = Object.entries(prices).map(([id, data]) => ({
      countryId: parseInt(id),
      name: data.name || `Country ${id}`,
      price8: data.price8,
      priceUSDC: (BigInt(data.price8) / BigInt(100)).toString(), // price8 / 100 = USDC6
      updatedAt: data.updatedAt.toISOString(),
      exists: data.exists ?? true,
    }))

    return NextResponse.json({
      ok: true,
      prices: formattedPrices,
      count: formattedPrices.length,
    })
  } catch (error: any) {
    console.error('[AdminMarket] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch market prices' },
      { status: 500 }
    )
  }
}

