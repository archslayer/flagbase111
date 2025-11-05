/**
 * Referral Stats Sync Worker
 * 
 * Periodically syncs wallet_referral_stats for all active referrers
 * Runs every 5 minutes
 */

import 'dotenv/config'
import { resolve } from 'path'
import { config } from 'dotenv'

config({ path: resolve(process.cwd(), '.env.local') })

import { getDb, getClient } from '../lib/mongodb'
import { syncWalletReferralStats } from '../lib/referral-stats-sync'

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let isShuttingDown = false

async function syncAllReferrers() {
  try {
    const db = await getDb()
    
    // Get all unique referrer wallets
    const referrers = await db.collection('referrals')
      .distinct('refWalletLower', { confirmedOnChain: true })
    
    console.log(`[Sync Worker] Found ${referrers.length} referrers to sync`)
    
    let synced = 0
    let errors = 0
    
    for (const wallet of referrers) {
      if (isShuttingDown) break
      
      try {
        await syncWalletReferralStats(wallet)
        synced++
        
        if (synced % 10 === 0) {
          console.log(`[Sync Worker] Progress: ${synced}/${referrers.length}`)
        }
      } catch (error: any) {
        console.error(`[Sync Worker] Error syncing ${wallet}:`, error.message)
        errors++
      }
    }
    
    console.log(`[Sync Worker] Sync complete: ${synced} synced, ${errors} errors`)
    
  } catch (error: any) {
    console.error('[Sync Worker] Sync failed:', error)
  }
}

async function main() {
  console.log('[Sync Worker] Starting...')
  console.log(`[Sync Worker] Interval: ${SYNC_INTERVAL_MS / 1000}s`)
  
  // Initial sync
  await syncAllReferrers()
  
  // Periodic sync
  const interval = setInterval(async () => {
    if (isShuttingDown) {
      clearInterval(interval)
      return
    }
    
    console.log('[Sync Worker] Starting periodic sync...')
    await syncAllReferrers()
  }, SYNC_INTERVAL_MS)
  
  // Graceful shutdown
  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true
    
    console.log('[Sync Worker] Shutting down...')
    clearInterval(interval)
    
    const client = getClient()
    await client.close()
    
    console.log('[Sync Worker] Shutdown complete')
    process.exit(0)
  }
  
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  
  console.log('[Sync Worker] Running. Press Ctrl+C to stop.')
}

main().catch((error) => {
  console.error('[Sync Worker] Fatal error:', error)
  process.exit(1)
})

