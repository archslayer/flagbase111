// lib/rpc/manager.ts
// Multi-provider RPC manager with automatic failover
// NEVER: Expose provider URLs or API keys in logs
// ALWAYS: Implement retry logic, health checks, graceful degradation

import { base, baseSepolia, type Chain } from 'viem/chains'
import { RpcProvider, ViemRpcProvider, type RpcCallResult, type FeeData } from './provider'

export interface ProviderHealth {
  provider: string
  healthy: boolean
  latency?: number
  errorRate: number
  lastError?: Date
}

export class RpcManager {
  private providers: RpcProvider[] = []
  private healthStats: Map<string, ProviderHealth> = new Map()
  private readonly chain: Chain
  private readonly isMainnet: boolean
  private requestCounter: number = 0 // Atomic counter for round-robin

  constructor(isMainnet: boolean = false) {
    this.isMainnet = isMainnet
    this.chain = isMainnet ? base : baseSepolia
    this.initializeProviders()
  }

  private initializeProviders(): void {
    const providers: Array<{ url: string; name: string }> = []

    if (this.isMainnet) {
      // Mainnet providers
      const infuraKey = process.env.INFURA_KEY
      if (infuraKey) {
        providers.push({
          url: `https://base-mainnet.infura.io/v3/${infuraKey}`,
          name: 'Infura-Mainnet'
        })
      }

      const backupMainnet = process.env.RPC_BACKUP_MAINNET
      if (backupMainnet) {
        providers.push({
          url: backupMainnet,
          name: 'Backup-Mainnet'
        })
      }

      // Base public RPC as last resort
      providers.push({
        url: 'https://mainnet.base.org',
        name: 'Base-Public-Mainnet'
      })
    } else {
      // Testnet providers
      const testnetRpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || process.env.RPC_TESTNET
      if (testnetRpc) {
        providers.push({
          url: testnetRpc,
          name: 'Testnet-RPC'
        })
      }

      // Base Sepolia public RPC
      providers.push({
        url: 'https://sepolia.base.org',
        name: 'Base-Public-Testnet'
      })
    }

    if (providers.length === 0) {
      throw new Error('No RPC providers configured')
    }

    // Initialize providers
    this.providers = providers.map(config => 
      new ViemRpcProvider(
        {
          url: config.url,
          name: config.name,
          timeout: 12_000, // 12s timeout (reduced from 30s)
          retries: 2 // Max 2 retries (reduced from 3)
        },
        this.chain
      )
    )

    // Initialize health stats
    this.providers.forEach(provider => {
      this.healthStats.set(provider.name, {
        provider: provider.name,
        healthy: true,
        errorRate: 0,
        latency: undefined
      })
    })

    // Log initialization (deferred to avoid blocking startup)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RpcManager] Initialized ${this.providers.length} providers for ${this.isMainnet ? 'mainnet' : 'testnet'}`)
    }
  }

  /**
   * Get healthy providers snapshot (thread-safe)
   */
  private getHealthyProviders(): RpcProvider[] {
    return this.providers.filter((provider, index) => {
      const stats = this.healthStats.get(provider.name)
      return stats?.healthy !== false // Default to healthy if no stats
    })
  }
  
  /**
   * Get provider with round-robin (thread-safe snapshot)
   */
  private getProviderForRequest(): RpcProvider {
    const healthy = this.getHealthyProviders()
    if (healthy.length === 0) {
      // Fallback to all providers if none are healthy
      return this.providers[0] || this.providers[Math.floor(Math.random() * this.providers.length)]
    }
    
    // Round-robin with random start offset per request
    const start = this.requestCounter++ % healthy.length
    return healthy[start]
  }

  /**
   * Get all providers
   */
  getAllProviders(): RpcProvider[] {
    return [...this.providers]
  }

  /**
   * Execute operation with provider failover (thread-safe)
   */
  private async withProviders<T>(
    operation: (provider: RpcProvider) => Promise<RpcCallResult<T>>,
    maxRetries: number = 2
  ): Promise<RpcCallResult<T>> {
    const pool = this.getHealthyProviders()
    if (pool.length === 0) {
      return {
        success: false,
        error: new Error('No healthy providers available'),
        provider: 'no-providers'
      }
    }
    
    const start = Math.floor(Math.random() * pool.length)
    let lastError: Error | undefined
    
    for (let i = 0; i < Math.min(maxRetries, pool.length); i++) {
      const provider = pool[(start + i) % pool.length]
      const startTime = Date.now()
      
      try {
        // Use shorter timeout per attempt (10-12s)
        const timeoutPromise = new Promise<RpcCallResult<T>>((_, reject) => {
          setTimeout(() => reject(new Error('Provider timeout')), 12_000)
        })
        
        const result = await Promise.race([
          operation(provider),
          timeoutPromise
        ])
        
        const latency = Date.now() - startTime
        
        if (result.success) {
          this.updateHealth(provider.name, true, latency)
          return result
        }
        
        // Check if retryable
        if (result.error && this.isRetryableError(result.error)) {
          lastError = result.error
          this.updateHealth(provider.name, false, latency)
          
          // Backoff before next attempt
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, this.backoff(i)))
          }
          continue
        }
        
        // Non-retryable error
        this.updateHealth(provider.name, false, latency)
        return result
      } catch (error: any) {
        const latency = Date.now() - startTime
        lastError = error instanceof Error ? error : new Error(String(error))
        this.updateHealth(provider.name, false, latency)
        
        if (this.isRetryableError(error) && i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.backoff(i)))
          continue
        }
        
        // Non-retryable or max retries
        break
      }
    }
    
    return {
      success: false,
      error: lastError || new Error('All providers failed'),
      provider: 'all-failed'
    }
  }

  /**
   * Check if error is retryable
   * Only retry on: timeouts, 408, 429, 5xx, and network errors
   * Never retry on: 4xx (except 408, 429), validation errors
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false

    const message = String(error?.message || '').toLowerCase()
    const code = Number(error?.status || error?.response?.status || error?.code || 0)
    
    // Retryable HTTP status codes
    const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504])
    
    // Check HTTP status code
    if (RETRYABLE_HTTP.has(code)) {
      return true
    }
    
    // Check error message patterns (network/timeout errors)
    const retryablePatterns = [
      /timeout/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
      /EAI_AGAIN/i,
      /fetch failed/i,
      /network error/i,
      /connection/i
    ]
    
    if (retryablePatterns.some(pattern => pattern.test(message))) {
      return true
    }
    
    // Check error name
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return true
    }
    
    return false
  }
  
  /**
   * Calculate backoff with jitter
   */
  private backoff(attempt: number): number {
    const base = Math.min(200 * Math.pow(2, attempt), 1500) // 200, 400, 800, 1500
    const jitter = Math.floor(Math.random() * 150)
    return base + jitter
  }

  /**
   * Update health statistics
   */
  private updateHealth(providerName: string, success: boolean, latency?: number): void {
    const stats = this.healthStats.get(providerName)
    if (!stats) return

    if (success) {
      stats.healthy = true
      stats.latency = latency
      // Decay error rate
      stats.errorRate = Math.max(0, stats.errorRate - 0.1)
    } else {
      stats.errorRate = Math.min(1, stats.errorRate + 0.2)
      stats.lastError = new Date()
      
      // Mark unhealthy if error rate > 50%
      if (stats.errorRate > 0.5) {
        stats.healthy = false
      }
    }
  }

  /**
   * Execute RPC call with failover (thread-safe, round-robin)
   */
  async callWithFailover<T = any>(
    method: string,
    params?: any[],
    maxRetries: number = 2
  ): Promise<RpcCallResult<T>> {
    return this.withProviders(
      async (provider) => provider.call<T>(method, params),
      maxRetries
    )
  }

  /**
   * Execute multicall with failover (thread-safe, round-robin)
   */
  async multicallWithFailover<T = any>(
    contracts: any[],
    maxRetries: number = 2
  ): Promise<RpcCallResult<T[]>> {
    return this.withProviders(
      async (provider) => provider.multicall<T>(contracts),
      maxRetries
    )
  }

  /**
   * Get fee data with failover (thread-safe, round-robin)
   */
  async getFeeDataWithFailover(maxRetries: number = 2): Promise<RpcCallResult<FeeData>> {
    return this.withProviders(
      async (provider) => provider.getFeeData(),
      maxRetries
    )
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<ProviderHealth[]> {
    const healthChecks = await Promise.all(
      this.providers.map(async provider => {
        const health = await provider.healthCheck()
        const stats = this.healthStats.get(provider.name) || {
          provider: provider.name,
          healthy: true,
          errorRate: 0
        }
        
        return {
          ...stats,
          healthy: health.healthy && stats.healthy,
          latency: health.latency || stats.latency
        }
      })
    )

    return healthChecks
  }

  /**
   * Get current chain ID
   */
  getChainId(): number {
    return this.chain.id
  }

  /**
   * Check if mainnet
   */
  isMainnetMode(): boolean {
    return this.isMainnet
  }
}

// Singleton instance
let rpcManagerInstance: RpcManager | null = null

/**
 * Get or create RPC manager instance
 */
export function getRpcManager(): RpcManager {
  if (!rpcManagerInstance) {
    const useMainnet = process.env.USE_MAINNET === 'true'
    rpcManagerInstance = new RpcManager(useMainnet)
  }
  return rpcManagerInstance
}

/**
 * Reset RPC manager (useful for testing or config changes)
 */
export function resetRpcManager(): void {
  rpcManagerInstance = null
}

