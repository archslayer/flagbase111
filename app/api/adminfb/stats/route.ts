// app/api/adminfb/stats/route.ts
// Admin dashboard stats endpoint

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifyJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/stats
 * Get dashboard overview statistics
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

    const db = await getDb()

    // Total users
    const totalUsers = await db.collection('users').countDocuments()

    // Active users (logged in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const activeUsers = await db.collection('users').countDocuments({
      lastLoginAt: { $gte: thirtyDaysAgo }
    })

    // Total referrals
    const totalReferrals = await db.collection('referrals').countDocuments()

    // Total attacks (from attacks collection or tx_events)
    const totalAttacks = await db.collection('attacks').countDocuments()

    // Total quest claims
    const totalQuests = await db.collection('quest_claims').countDocuments()

    // Revenue calculation (from sell fees)
    // Revenue = sum of all sell fees that went to revenue wallet
    // We need to check tx_events or attacks collection for fee data
    // For now, we'll estimate from attacks collection feeUSDC6
    const revenueResult = await db.collection('attacks').aggregate([
      {
        $match: {
          feeUSDC6: { $exists: true, $ne: null, $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          totalFees: { $sum: { $toDouble: '$feeUSDC6' } }
        }
      }
    ]).toArray()

    const totalFeesUSDC6 = revenueResult[0]?.totalFees || 0
    // Revenue is 70% of sell fees (30% goes to referrers)
    // But attack fees are different - they go 100% to revenue
    // For simplicity, we'll use total fees as revenue estimate
    const totalRevenueUSDC = (totalFeesUSDC6 / 1e6).toFixed(2)

    return NextResponse.json({
      ok: true,
      stats: {
        totalUsers,
        activeUsers,
        totalRevenue: totalRevenueUSDC,
        totalReferrals,
        totalAttacks,
        totalQuests,
      }
    })
  } catch (error: any) {
    console.error('[AdminStats] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}

