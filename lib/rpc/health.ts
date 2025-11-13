// lib/rpc/health.ts
// RPC provider health checks and monitoring
// NEVER: Expose sensitive provider info, ignore errors
// ALWAYS: Validate chain ID, track metrics, alert on issues

import { getRpcManager } from './manager'
import type { RpcProvider } from './provider'

export interface HealthMetrics {
  chainId: number
  expectedChainId: number
  chainIdValid: boolean
  providers: Array<{
    name: string
    healthy: boolean
    latency?: number
    errorRate: number
    lastError?: Date
  }>
  overallHealthy: boolean
  warnings: string[]
}

const EXPECTED_TESTNET_CHAIN_ID = 84532
const EXPECTED_MAINNET_CHAIN_ID = 8453
const ERROR_RATE_THRESHOLD = 0.1 // 10%
const LATENCY_THRESHOLD_MS = 800 // 800ms

/**
 * Validate chain ID matches expected value
 */
export async function validateChainId(): Promise<{ valid: boolean; actual?: number; expected: number; error?: string }> {
  const manager = getRpcManager()
  const isMainnet = manager.isMainnetMode()
  const expectedChainId = isMainnet ? EXPECTED_MAINNET_CHAIN_ID : EXPECTED_TESTNET_CHAIN_ID

  try {
    const chainIdResult = await manager.callWithFailover<number>('eth_chainId')
    
    if (!chainIdResult.success || chainIdResult.data === undefined) {
      return {
        valid: false,
        expected: expectedChainId,
        error: chainIdResult.error?.message || 'Failed to get chain ID'
      }
    }

    const actualChainId = chainIdResult.data
    const valid = actualChainId === expectedChainId

    if (!valid) {
      console.error(
        `[Health] Chain ID mismatch: expected ${expectedChainId} (${isMainnet ? 'mainnet' : 'testnet'}), got ${actualChainId}`
      )
    }

    return {
      valid,
      actual: actualChainId,
      expected: expectedChainId,
      error: valid ? undefined : `Chain ID mismatch: expected ${expectedChainId}, got ${actualChainId}`
    }
  } catch (error: any) {
    return {
      valid: false,
      expected: expectedChainId,
      error: error?.message || 'Chain ID validation failed'
    }
  }
}

/**
 * Get comprehensive health metrics
 */
export async function getHealthMetrics(): Promise<HealthMetrics> {
  const manager = getRpcManager()
  const isMainnet = manager.isMainnetMode()
  const expectedChainId = isMainnet ? EXPECTED_MAINNET_CHAIN_ID : EXPECTED_TESTNET_CHAIN_ID

  // Validate chain ID
  const chainValidation = await validateChainId()
  const chainId = chainValidation.actual || manager.getChainId()

  // Get provider health
  const providerHealth = await manager.getHealthStatus()
  
  // Calculate overall health
  const healthyProviders = providerHealth.filter(p => p.healthy)
  const overallHealthy = chainValidation.valid && healthyProviders.length > 0

  // Collect warnings
  const warnings: string[] = []
  
  if (!chainValidation.valid) {
    warnings.push(`Chain ID mismatch: expected ${expectedChainId}, got ${chainId}`)
  }

  providerHealth.forEach(provider => {
    if (provider.errorRate > ERROR_RATE_THRESHOLD) {
      warnings.push(`Provider ${provider.provider} error rate ${(provider.errorRate * 100).toFixed(1)}% exceeds threshold`)
    }
    
    if (provider.latency && provider.latency > LATENCY_THRESHOLD_MS) {
      warnings.push(`Provider ${provider.provider} latency ${provider.latency}ms exceeds threshold`)
    }
    
    if (!provider.healthy) {
      warnings.push(`Provider ${provider.provider} is unhealthy`)
    }
  })

  if (healthyProviders.length === 0) {
    warnings.push('No healthy providers available')
  }

  return {
    chainId,
    expectedChainId,
    chainIdValid: chainValidation.valid,
    providers: providerHealth.map(p => ({
      name: p.provider,
      healthy: p.healthy,
      latency: p.latency,
      errorRate: p.errorRate,
      lastError: p.lastError
    })),
    overallHealthy,
    warnings
  }
}

/**
 * Redact sensitive information from URLs and errors
 */
function redactUrl(url: string): string {
  return url
    .replace(/(infura\.io\/v3\/)[A-Za-z0-9_-]+/g, '$1[REDACTED]')
    .replace(/(alchemy\.com\/v2\/)[A-Za-z0-9_-]+/g, '$1[REDACTED]')
    .replace(/[a-f0-9]{32,}/gi, '[REDACTED_KEY]')
}

/**
 * Get provider info for health endpoint (sanitized)
 */
export function getProviderInfoForHealth(provider: RpcProvider): { host: string; name: string } {
  try {
    const url = (provider as any).config?.url || ''
    const host = url ? new URL(url).host : 'unknown'
    return {
      host: redactUrl(host),
      name: provider.name
    }
  } catch {
    return {
      host: '[REDACTED]',
      name: provider.name
    }
  }
}

/**
 * Startup chain ID validation (HARD-FAIL on mismatch)
 */
export async function validateChainOnStartup(): Promise<void> {
  console.log('[Health] Validating chain ID on startup...')
  
  const manager = getRpcManager()
  const isMainnet = manager.isMainnetMode()
  const expectedChainId = isMainnet ? EXPECTED_MAINNET_CHAIN_ID : EXPECTED_TESTNET_CHAIN_ID
  
  try {
    const validation = await validateChainId()
    
    if (!validation.valid || validation.actual !== expectedChainId) {
      const error = `[Health] ❌ CHAIN_ID_MISMATCH: expected ${expectedChainId} (${isMainnet ? 'mainnet' : 'testnet'}), got ${validation.actual || 'unknown'}`
      console.error(error)
      console.error(`[Health] Provider host: ${manager.getAllProviders()[0]?.name || 'unknown'}`)
      // HARD-FAIL: Throw error to prevent wrong network usage
      throw new Error(`CHAIN_ID_MISMATCH: expected ${expectedChainId}, got ${validation.actual || 'unknown'}`)
    }

    console.log(
      `[Health] ✅ Chain ID validated: ${validation.actual} (${isMainnet ? 'mainnet' : 'testnet'})`
    )
  } catch (error: any) {
    // Re-throw chain ID mismatch errors
    if (error?.message?.includes('CHAIN_ID_MISMATCH')) {
      throw error
    }
    // Other errors: log warning but allow startup (network might be temporarily unavailable)
    console.warn('[Health] ⚠️  Chain ID validation skipped due to error:', error?.message || error)
  }
}

