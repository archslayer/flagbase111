// lib/rpc/provider.ts
// RPC Provider abstraction layer for multi-provider support with failover
// NEVER: Log API keys, expose provider URLs in errors
// ALWAYS: Sanitize errors, implement retry logic, support mainnet/testnet switching

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Account, type Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import httpAgent from 'node:http'
import httpsAgent from 'node:https'

// Shared HTTP agents with keep-alive for connection reuse
const httpKeepAliveAgent = new httpAgent.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 10,
  timeout: 12_000
})

const httpsKeepAliveAgent = new httpsAgent.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 10,
  timeout: 12_000
})

export interface RpcProviderConfig {
  url: string
  name: string
  timeout?: number
  retries?: number
}

export interface RpcCallResult<T = any> {
  success: boolean
  data?: T
  error?: Error
  provider?: string
}

export interface FeeData {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  gasPrice?: bigint
}

export interface RpcProvider {
  name: string
  call<T = any>(method: string, params?: any[]): Promise<RpcCallResult<T>>
  multicall<T = any>(contracts: any[]): Promise<RpcCallResult<T[]>>
  estimateGas(params: any): Promise<RpcCallResult<bigint>>
  getFeeData(): Promise<RpcCallResult<FeeData>>
  getBlockNumber(): Promise<RpcCallResult<bigint>>
  getChainId(): Promise<RpcCallResult<number>>
  healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }>
}

/**
 * Viem-based RPC Provider implementation
 */
export class ViemRpcProvider implements RpcProvider {
  public readonly name: string
  private readonly publicClient: PublicClient
  private readonly chain: Chain
  private readonly config: RpcProviderConfig
  private healthStatus: { healthy: boolean; lastCheck: number; latency?: number } = {
    healthy: true,
    lastCheck: 0
  }

  constructor(config: RpcProviderConfig, chain: Chain) {
    this.name = config.name
    this.config = config
    this.chain = chain

    const timeout = config.timeout || 12_000 // 12s default (reduced from 30s)
    const retries = config.retries || 2 // Max 2 retries (reduced from 3)

    // Lazy HTTP transport - doesn't connect immediately
    // Connection is established only on first RPC call
    // Use shared keep-alive agent for connection reuse
    const isHttps = config.url.startsWith('https://')
    const agent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent
    
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.url, {
        timeout,
        retryCount: retries,
        retryDelay: 1000,
        // Don't batch by default to avoid connection overhead on startup
        batch: false,
        // Use shared agent for connection reuse (keep-alive)
        ...(typeof window === 'undefined' ? { fetchOptions: { agent } as any } : {})
      })
    })
  }

  async call<T = any>(method: string, params?: any[]): Promise<RpcCallResult<T>> {
    const startTime = Date.now()
    try {
      // Map common RPC methods to viem client methods
      let result: any

      switch (method) {
        case 'eth_blockNumber':
          result = await this.publicClient.getBlockNumber()
          break
        case 'eth_chainId':
          result = await this.publicClient.getChainId()
          break
        case 'eth_getBalance':
          if (!params || params.length < 2) throw new Error('Invalid params')
          result = await this.publicClient.getBalance({ address: params[0] as `0x${string}`, blockTag: params[1] as any })
          break
        default:
          // Fallback to direct RPC call
          result = await this.publicClient.request({ method, params } as any)
      }

      const latency = Date.now() - startTime
      this.updateHealth(true, latency)

      return {
        success: true,
        data: result as T,
        provider: this.name
      }
    } catch (error: any) {
      const latency = Date.now() - startTime
      this.updateHealth(false, latency)
      
      return {
        success: false,
        error: this.sanitizeError(error),
        provider: this.name
      }
    }
  }

  async multicall<T = any>(contracts: any[]): Promise<RpcCallResult<T[]>> {
    const startTime = Date.now()
    try {
      const results = await this.publicClient.multicall({
        contracts,
        allowFailure: true
      })

      const latency = Date.now() - startTime
      this.updateHealth(true, latency)

      return {
        success: true,
        data: results as T[],
        provider: this.name
      }
    } catch (error: any) {
      const latency = Date.now() - startTime
      this.updateHealth(false, latency)

      return {
        success: false,
        error: this.sanitizeError(error),
        provider: this.name
      }
    }
  }

  async estimateGas(params: any): Promise<RpcCallResult<bigint>> {
    const startTime = Date.now()
    try {
      const gas = await this.publicClient.estimateGas(params)
      const latency = Date.now() - startTime
      this.updateHealth(true, latency)

      return {
        success: true,
        data: gas,
        provider: this.name
      }
    } catch (error: any) {
      const latency = Date.now() - startTime
      this.updateHealth(false, latency)

      return {
        success: false,
        error: this.sanitizeError(error),
        provider: this.name
      }
    }
  }

  async getFeeData(): Promise<RpcCallResult<FeeData>> {
    const startTime = Date.now()
    try {
      const [block, chainId] = await Promise.all([
        this.publicClient.getBlock({ blockTag: 'latest' }),
        this.publicClient.getChainId()
      ])

      // EIP-1559 fee calculation
      const baseFee = block.baseFeePerGas || 0n
      
      // Calculate EIP-1559 fees (pure BigInt)
      const minPriorityFee = 100_000_000n // 0.1 gwei
      const maxPriorityFee = 300_000_000n // 0.3 gwei
      const defaultPriorityFee = 200_000_000n // 0.2 gwei
      
      // Use default priority fee (can be enhanced with block data later)
      const maxPriorityFeePerGas = defaultPriorityFee
      
      // Calculate maxFeePerGas: baseFee * 1.2 + priorityFee (pure BigInt)
      const maxFeePerGas = baseFee > 0n 
        ? (baseFee * 120n / 100n) + maxPriorityFeePerGas
        : maxPriorityFeePerGas * 2n

      const latency = Date.now() - startTime
      this.updateHealth(true, latency)

      return {
        success: true,
        data: {
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasPrice: baseFee > 0n ? undefined : maxPriorityFeePerGas
        },
        provider: this.name
      }
    } catch (error: any) {
      const latency = Date.now() - startTime
      this.updateHealth(false, latency)

      return {
        success: false,
        error: this.sanitizeError(error),
        provider: this.name
      }
    }
  }

  async getBlockNumber(): Promise<RpcCallResult<bigint>> {
    return this.call<bigint>('eth_blockNumber')
  }

  async getChainId(): Promise<RpcCallResult<number>> {
    return this.call<number>('eth_chainId')
  }

  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const now = Date.now()
    // Cache health check for 30 seconds
    if (this.healthStatus.lastCheck > 0 && now - this.healthStatus.lastCheck < 30_000) {
      return {
        healthy: this.healthStatus.healthy,
        latency: this.healthStatus.latency
      }
    }

    try {
      const startTime = Date.now()
      await this.publicClient.getBlockNumber()
      const latency = Date.now() - startTime
      
      this.updateHealth(true, latency)
      return { healthy: true, latency }
    } catch (error: any) {
      this.updateHealth(false)
      return {
        healthy: false,
        error: this.sanitizeError(error).message
      }
    }
  }

  getPublicClient(): PublicClient {
    return this.publicClient
  }

  createWalletClient(account: Account): WalletClient {
    // Use shared keep-alive agent for connection reuse
    const isHttps = this.config.url.startsWith('https://')
    const agent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent
    
    return createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.config.url, {
        timeout: this.config.timeout || 12_000, // 12s timeout
        retryCount: this.config.retries || 2, // Max 2 retries
        ...(typeof window === 'undefined' ? { fetchOptions: { agent } as any } : {})
      })
    })
  }

  private updateHealth(healthy: boolean, latency?: number): void {
    this.healthStatus = {
      healthy,
      lastCheck: Date.now(),
      latency
    }
  }

  private sanitizeError(error: any): Error {
    // Remove sensitive information from errors
    const message = error?.message || String(error)
    
    // Remove API keys, URLs, etc.
    const sanitized = message
      .replace(/https?:\/\/[^\s]+/g, '[REDACTED_URL]')
      .replace(/[a-f0-9]{32,}/gi, '[REDACTED_KEY]')
      .replace(/api[_-]?key[=:]\s*[^\s]+/gi, 'api_key=[REDACTED]')

    return new Error(sanitized)
  }
}

