// Queue health check endpoint (Node runtime, no server-only imports in route)
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (process.env.USE_QUEUE !== 'true') {
      return NextResponse.json({ ok: true, queue: 'disabled' })
    }

    // Dynamic import to avoid compile issues
    const { Queue } = await import('bullmq')
    const { getIORedisConfig } = await import('@/lib/redis-ioredis')
    
    const conn = getIORedisConfig()
    if (!conn) {
      return NextResponse.json({ ok: false, error: 'Queue connection failed' }, { status: 500 })
    }

    const prefix = process.env.QUEUE_PREFIX || 'flagwars'
    const queueName = `${prefix}-attack-events`
    
    const q = new Queue(queueName, { connection: conn })
    
    const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    
    return NextResponse.json({ ok: true, counts, queueName })
  } catch (e: any) {
    console.error('[HEALTH/QUEUE] Error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 })
  }
}
