// Analytics event enqueue helper
import 'server-only'
import { makeQueue, defaultJobOpts } from './queue'
import type { AnyEvtT } from '@/types/events'

/**
 * Enqueue an analytics event (buy/sell/attack) to append-only audit
 * 
 * IMPORTANT: Ensure evt.logIndex is the actual on-chain logIndex from the transaction receipt.
 * If multiple events occur in the same tx, logIndex must be unique to prevent collisions
 * with the unique index: { txHash, logIndex, type }
 * 
 * @param evt Event payload (validated by worker)
 * @returns Job ID or null if queue disabled
 */
export async function enqueueAnalyticsEvent(evt: AnyEvtT): Promise<string | null> {
  const q = makeQueue('analytics-write')
  if (!q) {
    console.warn('[ANALYTICS] Queue disabled, skipping event:', evt.type, evt.txHash)
    return null
  }
  
  try {
    // Use txHash:logIndex:type as idempotent jobId
    const jobId = `${evt.txHash}:${evt.logIndex}:${evt.type}`
    
    const job = await q.add('evt', evt, defaultJobOpts({ jobId }))
    
    console.log(`[ANALYTICS] Enqueued ${evt.type} job=${job.id} tx=${evt.txHash.slice(0, 10)}...`)
    
    return job.id
  } catch (err) {
    console.error('[ANALYTICS] Failed to enqueue event:', err)
    return null
  }
}

