// app/api/adminfb/revenue/route.ts
// Admin revenue statistics endpoint

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifyJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/revenue?period=7d|30d|all
 * Get revenue statistics with time breakdown
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

    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period') || '30d'

    const db = await getDb()

    // Calculate date range
    const now = new Date()
    let startDate: Date
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(0) // All time
    }

    // Get revenue from attacks (attack fees)
    const attackRevenue = await db.collection('attacks').aggregate([
      {
        $match: {
          ts: { $gte: startDate },
          feeUSDC6: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalFees: { $sum: { $toDouble: '$feeUSDC6' } },
          count: { $sum: 1 }
        }
      }
    ]).toArray()

    const attackFeesUSDC6 = attackRevenue[0]?.totalFees || 0
    const attackCount = attackRevenue[0]?.count || 0

    // Get daily breakdown
    const dailyBreakdown = await db.collection('attacks').aggregate([
      {
        $match: {
          ts: { $gte: startDate },
          feeUSDC6: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$ts' }
          },
          revenue: { $sum: { $toDouble: '$feeUSDC6' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray()

    // Format daily breakdown
    const daily = dailyBreakdown.map(item => ({
      date: item._id,
      revenue: (item.revenue / 1e6).toFixed(2),
      count: item.count,
    }))

    return NextResponse.json({
      ok: true,
      period,
      revenue: {
        total: (attackFeesUSDC6 / 1e6).toFixed(2),
        totalUSDC6: attackFeesUSDC6.toString(),
        count: attackCount,
      },
      daily,
    })
  } catch (error: any) {
    console.error('[AdminRevenue] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch revenue' },
      { status: 500 }
    )
  }
}

