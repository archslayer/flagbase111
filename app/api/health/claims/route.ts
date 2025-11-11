/**
 * Health Check - Claim Worker Status
 * 
 * Returns:
 * - Blockchain connection status
 * - Current block number
 * - Pending/processing/failed claim counts
 * 
 * Security: Production requires X-Admin-Token header
 */

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { publicClient } from '@/lib/viem/clients'
import { dayStrUTC } from '@/lib/daily-payout-tracker'

// Direct collection names (avoid server-only import)
const COLLECTIONS = {
  OFFCHAIN_CLAIMS: 'offchain_claims',
  DAILY_PAYOUTS: 'daily_payouts'
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Production security check
  if (process.env.NODE_ENV === 'production') {
    const token = req.headers.get('x-admin-token')
    if (token !== process.env.ADMIN_HEALTH_TOKEN) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        {
          status: 403,
          headers: { 'Cache-Control': 'no-store' }
        }
      )
    }
  }

  try {
    // Check MongoDB
    const db = await getDb()
    await db.command({ ping: 1 })

    // Get claim stats
    const claimsCollection = db.collection(COLLECTIONS.OFFCHAIN_CLAIMS)
    
    const now = new Date()
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)

    const [
      pending,
      processing,
      completed,
      failed,
      oldestPending,
      rate1m,
      lastProcessed
    ] = await Promise.all([
      // Basic counts
      claimsCollection.countDocuments({ status: 'pending' }),
      claimsCollection.countDocuments({ status: 'processing' }),
      claimsCollection.countDocuments({ status: 'completed' }),
      claimsCollection.countDocuments({ status: 'failed' }),
      
      // Oldest pending claim (for lag calculation)
      claimsCollection
        .find({ status: 'pending' })
        .sort({ claimedAt: 1 })
        .limit(1)
        .toArray(),
      
      // Claims completed in last 1 minute
      claimsCollection.countDocuments({
        status: 'completed',
        processedAt: { $gte: oneMinuteAgo }
      }),
      
      // Last processed claim (for health check)
      claimsCollection
        .find({ status: 'completed' })
        .sort({ processedAt: -1 })
        .limit(1)
        .toArray()
    ])

    // Calculate processing lag
    let processingLagSec: number | null = null
    if (oldestPending.length > 0 && oldestPending[0].claimedAt) {
      const lagMs = now.getTime() - new Date(oldestPending[0].claimedAt).getTime()
      processingLagSec = Math.floor(lagMs / 1000)
    }

    // Last processed timestamp
    let lastProcessedAt: string | null = null
    if (lastProcessed.length > 0 && lastProcessed[0].processedAt) {
      lastProcessedAt = new Date(lastProcessed[0].processedAt).toISOString()
    }

    // Check blockchain connection
    const block = await publicClient.getBlockNumber()

    // Get daily payout summary
    const dayStr = dayStrUTC(now)
    const usdcAddress = process.env.CLAIM_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS

    const [dailyAgg] = await db.collection(COLLECTIONS.DAILY_PAYOUTS).aggregate([
      { $match: { day: dayStr, token: usdcAddress?.toLowerCase() } },
      {
        $group: {
          _id: null,
          totalUSDC6: { $sum: '$amountUSDC6' },
          usersAtCap: { $sum: { $cond: ['$hitCap', 1, 0] } },
          totalUsers: { $sum: 1 }
        }
      }
    ]).toArray()

    // Top 10 users by payout today
    const topUsers = await db.collection(COLLECTIONS.DAILY_PAYOUTS)
      .find({ day: dayStr, token: usdcAddress?.toLowerCase() })
      .sort({ amountUSDC6: -1 })
      .limit(10)
      .project({ _id: 0, wallet: 1, amountUSDC6: 1, hitCap: 1 })
      .toArray()

    return NextResponse.json(
      {
        ok: true,
        timestamp: now.toISOString(),
        blockchain: {
          connected: true,
          block: block.toString()
        },
        mongodb: {
          connected: true
        },
        claims: {
          pending,
          processing,
          completed,
          failed,
          total: pending + processing + completed + failed
        },
        metrics: {
          lastProcessedAt,
          processingLagSec,
          rate1m,
          health: processingLagSec && processingLagSec > 300 ? 'degraded' : 'healthy'
        },
        daily: {
          day: dayStr,
          totalUSDC6: String(dailyAgg?.totalUSDC6 ?? 0),
          totalUsers: dailyAgg?.totalUsers ?? 0,
          usersAtCap: dailyAgg?.usersAtCap ?? 0,
          topUsers: topUsers.map(u => ({
            wallet: u.wallet.slice(0, 10) + '...',
            amountUSDC6: String(u.amountUSDC6),
            hitCap: u.hitCap
          }))
        }
      },
      {
        headers: { 'Cache-Control': 'no-store' }
      }
    )
  } catch (error: any) {
    console.error('[Health/Claims] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Health check failed',
        timestamp: new Date().toISOString()
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' }
      }
    )
  }
}

