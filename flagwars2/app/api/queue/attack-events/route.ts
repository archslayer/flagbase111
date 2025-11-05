// Producer API: enqueue attack events
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { makeQueue, defaultJobOpts } from '@/lib/queue'
import { enqueueAnalyticsEvent } from '@/lib/analytics-enqueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const q = makeQueue('attack-events')
    if (!q) {
      return NextResponse.json({ ok: false, reason: 'queue-disabled' }, { status: 503 })
    }

    const body = await req.json()
    // Expected payload:
    // { user, fromId, toId, amountToken18, txHash, blockNumber, feeUSDC6, timestamp }

    const job = await q.add('attack', body, defaultJobOpts({
      jobId: body.txHash // Use txHash as idempotent key
    }))
    
    console.log(`[QUEUE/ATTACK] Enqueued job ${job.id} for tx ${body.txHash}`)
    
    // Also enqueue analytics event (non-blocking)
    // TODO: Extract actual logIndex from receipt for better idempotency
    enqueueAnalyticsEvent({
      type: 'attack',
      chainId: 84532, // Base Sepolia
      txHash: body.txHash,
      logIndex: 0, // FIXME: Should be actual logIndex from on-chain logs
      blockNumber: Number(body.blockNumber || 0),
      timestamp: Math.floor((body.timestamp || Date.now()) / 1000),
      wallet: body.user.toLowerCase(), // Normalize to lowercase
      fromId: Number(body.fromId),
      toId: Number(body.toId),
      feeUSDC6: body.feeUSDC6 || '0',
      amountToken18: body.amountToken18 || '0'
    }).catch(e => console.error('[QUEUE/ATTACK] Analytics enqueue failed:', e))
    
    return NextResponse.json({ ok: true, jobId: job.id })
  } catch (e: any) {
    console.error('[QUEUE/ATTACK] Enqueue error:', e)
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 })
  }
}

