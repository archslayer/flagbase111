// app/api/adminfb/referrals/route.ts
// Admin referral statistics endpoint

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifyJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/referrals?page=1&limit=50
 * Get referral statistics
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const db = await getDb()

    // Get total referrals count
    const totalReferrals = await db.collection('referrals').countDocuments()

    // Get active referrals (isActive: true)
    const activeReferrals = await db.collection('referrals').countDocuments({
      isActive: true
    })

    // Get top referrers
    const topReferrers = await db.collection('referrals').aggregate([
      {
        $group: {
          _id: '$refWallet',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$isActive', 1, 0] }
          }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 20
      }
    ]).toArray()

    // Get paginated referrals
    const referrals = await db.collection('referrals')
      .find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Format top referrers
    const top = topReferrers.map(item => ({
      wallet: item._id,
      totalReferrals: item.count,
      activeReferrals: item.activeCount,
    }))

    return NextResponse.json({
      ok: true,
      stats: {
        totalReferrals,
        activeReferrals,
      },
      topReferrers: top,
      referrals: referrals.map(r => ({
        userId: r.userId,
        refWallet: r.refWallet,
        createdAt: r.createdAt,
        isActive: r.isActive,
        totalBuys: r.totalBuys || 0,
        totalSells: r.totalSells || 0,
      })),
      pagination: {
        page,
        limit,
        total: totalReferrals,
        totalPages: Math.ceil(totalReferrals / limit),
      }
    })
  } catch (error: any) {
    console.error('[AdminReferrals] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch referrals' },
      { status: 500 }
    )
  }
}

