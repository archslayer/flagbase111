// app/api/adminfb/users/route.ts
// Admin users management endpoint

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { verifyJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/users?page=1&limit=50&search=0x...
 * Get paginated user list
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
    const search = searchParams.get('search')?.toLowerCase()

    const db = await getDb()

    // Build query
    const query: any = {}
    if (search) {
      query.userId = { $regex: search, $options: 'i' }
    }

    // Get total count
    const total = await db.collection('users').countDocuments(query)

    // Get paginated users
    const users = await db.collection('users')
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    // Enrich with additional stats
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const wallet = user.userId || user.wallet

        // Get referral count
        const referralCount = await db.collection('referrals').countDocuments({
          refWallet: wallet
        })

        // Get quest claims count
        const questCount = await db.collection('quest_claims').countDocuments({
          wallet: wallet.toLowerCase()
        })

        // Get attack count
        const attackCount = await db.collection('attacks').countDocuments({
          attacker: wallet.toLowerCase()
        })

        return {
          wallet,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          referralCount,
          questCount,
          attackCount,
        }
      })
    )

    return NextResponse.json({
      ok: true,
      users: enrichedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    })
  } catch (error: any) {
    console.error('[AdminUsers] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

