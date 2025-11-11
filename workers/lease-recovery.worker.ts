/**
 * Lease Recovery Worker
 * 
 * Recovers stuck claims that are in 'processing' status
 * but haven't been completed within timeout period.
 * 
 * Runs every 5 minutes, recovers claims older than 10 minutes.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { getDb, getClient } from '../lib/mongodb'

const COLLECTIONS = {
  OFFCHAIN_CLAIMS: 'offchain_claims'
}

const LEASE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

let isShuttingDown = false

async function recoverStuckClaims() {
  const db = await getDb()
  const collection = db.collection(COLLECTIONS.OFFCHAIN_CLAIMS)

  const now = new Date()
  const timeout = new Date(now.getTime() - LEASE_TIMEOUT_MS)

  // Find stuck claims:
  // - status='processing'
  // - no processedAt
  // - leaseAt < timeout
  const result = await collection.updateMany(
    {
      status: 'processing',
      processedAt: { $exists: false },
      $or: [
        { leaseAt: { $lt: timeout } },
        { leaseAt: { $exists: false } } // Old claims without leaseAt
      ]
    },
    {
      $set: {
        status: 'pending',
        error: 'LEASE_TIMEOUT_RECOVERED'
      }
    }
  )

  if (result.modifiedCount > 0) {
    console.log(`[Lease Recovery] ✅ Recovered ${result.modifiedCount} stuck claims`)
  }

  return result.modifiedCount
}

async function mainLoop() {
  console.log('[Lease Recovery] Starting worker...')
  console.log(`  Timeout: ${LEASE_TIMEOUT_MS / 1000 / 60} minutes`)
  console.log(`  Check interval: ${CHECK_INTERVAL_MS / 1000 / 60} minutes`)

  while (!isShuttingDown) {
    try {
      const recovered = await recoverStuckClaims()
      
      if (recovered === 0) {
        console.log(`[Lease Recovery] ✅ No stuck claims (${new Date().toISOString()})`)
      }
    } catch (error: any) {
      console.error(`[Lease Recovery] ❌ Error:`, error?.message || error)
    }

    // Sleep until next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS))
  }

  console.log('[Lease Recovery] Worker stopped')
}

async function shutdown() {
  if (isShuttingDown) return
  
  console.log('[Lease Recovery] Shutting down...')
  isShuttingDown = true

  try {
    const client = getClient()
    await client?.close()
    console.log('[Lease Recovery] ✅ MongoDB closed')
  } catch (error) {
    console.error('[Lease Recovery] Error closing MongoDB:', error)
  }

  process.exit(0)
}

// Register shutdown handlers
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Start worker
mainLoop().catch(error => {
  console.error('[Lease Recovery] Fatal error:', error)
  process.exit(1)
})

