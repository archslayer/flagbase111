/**
 * Activity Feed Health Check
 * 
 * GET /api/health/activity
 * Returns Redis connection status and recent attacks count
 */

import { NextResponse } from 'next/server'
import { getActivityHealth } from '@/lib/activity/attacks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await getActivityHealth()
  
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store'
    }
  })
}

