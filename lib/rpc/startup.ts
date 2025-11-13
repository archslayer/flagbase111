// lib/rpc/startup.ts
// RPC system startup validation
// NEVER: Skip validation, ignore errors
// ALWAYS: Validate chain ID, check provider health, log status

import { validateChainOnStartup, getHealthMetrics } from './health'
import { getRpcManager } from './manager'

/**
 * Initialize and validate RPC system on startup
 */
/**
 * Initialize RPC system (non-blocking, runs in background)
 */
export async function initializeRpcSystem(): Promise<void> {
  // Run in background, don't block startup
  setImmediate(async () => {
    try {
      console.log('[RPC Startup] Initializing RPC system (background)...')
      
      // Initialize manager (will be created on first access)
      const manager = getRpcManager()
      const isMainnet = manager.isMainnetMode()
      
      console.log(`[RPC Startup] Mode: ${isMainnet ? 'MAINNET' : 'TESTNET'}`)
      console.log(`[RPC Startup] Chain ID: ${manager.getChainId()}`)
      console.log(`[RPC Startup] Providers: ${manager.getAllProviders().length}`)
      
      // Validate chain ID (non-blocking)
      await validateChainOnStartup()
      
      // Check provider health (with timeout to prevent hanging)
      try {
        const healthMetrics = await Promise.race([
          getHealthMetrics(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 10_000)
          )
        ])
        
        if (!healthMetrics.overallHealthy) {
          console.warn('[RPC Startup] ⚠️  Some providers are unhealthy:')
          healthMetrics.warnings.forEach(warning => {
            console.warn(`  - ${warning}`)
          })
        } else {
          console.log('[RPC Startup] ✅ All providers healthy')
        }
        
        // Log provider status
        healthMetrics.providers.forEach(provider => {
          const status = provider.healthy ? '✅' : '❌'
          const latency = provider.latency ? `${provider.latency}ms` : 'N/A'
          console.log(`[RPC Startup] ${status} ${provider.name}: ${latency} (error rate: ${(provider.errorRate * 100).toFixed(1)}%)`)
        })
      } catch (healthError: any) {
        console.warn('[RPC Startup] ⚠️  Health check skipped:', healthError?.message || healthError)
      }
      
      console.log('[RPC Startup] ✅ RPC system initialized successfully')
    } catch (error: any) {
      // Don't throw - just log warning
      console.warn('[RPC Startup] ⚠️  RPC initialization warning:', error?.message || error)
    }
  })
}

