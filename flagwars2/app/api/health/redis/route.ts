// Redis health check endpoint
import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const r = await getRedis()
    
    if (!r) {
      return NextResponse.json(
        { ok: false, reason: 'USE_REDIS=false or no URL configured' },
        { status: 200 }
      )
    }

    // Test ping
    const start = Date.now()
    const pong = await r.ping()
    const latency = Date.now() - start

    if (pong !== 'PONG') {
      return NextResponse.json(
        { ok: false, reason: 'PING failed', response: pong },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    console.error('[HEALTH] Redis check failed:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

