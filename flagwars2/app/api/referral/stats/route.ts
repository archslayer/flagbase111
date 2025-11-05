/**
 * GET /api/referral/stats
 * Simple referral stats endpoint
 * 
 * Returns:
 * - totalReferrals
 * - activeReferrals  
 * - accruedUSDC6
 * - claimedUSDC6
 * - claimableUSDC6
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { getWalletReferralStats, getClaimableBalance } from '@/lib/referral-stats-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const wallet = searchParams.get('wallet')
    
    if (!wallet) {
      return NextResponse.json(
        { ok: false, error: 'WALLET_REQUIRED' },
        { status: 400 }
      )
    }
    
    const checksummed = getAddress(wallet)
    
    // Get stats (with auto-sync if stale)
    const stats = await getWalletReferralStats(checksummed)
    
    // Get claimable balance
    const { accrued, claimed, claimable } = await getClaimableBalance(checksummed)
    
    return NextResponse.json({
      ok: true,
      stats: {
        totalReferrals: stats?.totalReferrals || 0,
        activeReferrals: stats?.activeReferrals || 0,
        accruedUSDC6: stats?.balanceUSDC6Accrued || '0',
        claimedUSDC6: claimed.toString(),
        claimableUSDC6: claimable.toString(),
        lastUpdated: stats?.lastUpdated || new Date()
      }
    })
    
  } catch (error: any) {
    console.error('[API /referral/stats] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'STATS_FAILED' },
      { status: 500 }
    )
  }
}
