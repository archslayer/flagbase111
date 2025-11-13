// lib/rpc/client.ts
// Unified RPC client interface using RpcManager
// NEVER: Create multiple RPC clients, expose provider URLs
// ALWAYS: Use singleton manager, implement batching, handle errors gracefully

import { type PublicClient, type WalletClient, type Account } from 'viem'
import { getRpcManager } from './manager'
import { ViemRpcProvider } from './provider'

/**
 * Get public client from first available provider
 */
export function getPublicClient(): PublicClient {
  const manager = getRpcManager()
  const providers = manager.getAllProviders()
  if (providers.length === 0) {
    throw new Error('No RPC providers available')
  }
  
  // Use first provider (round-robin handled by manager internally)
  const provider = providers[0]
  if (provider instanceof ViemRpcProvider) {
    return provider.getPublicClient()
  }
  
  throw new Error('Provider is not a ViemRpcProvider instance')
}

/**
 * Create wallet client from first available provider
 */
export function createWalletClient(account: Account): WalletClient {
  const manager = getRpcManager()
  const providers = manager.getAllProviders()
  if (providers.length === 0) {
    throw new Error('No RPC providers available')
  }
  
  // Use first provider (round-robin handled by manager internally)
  const provider = providers[0]
  if (provider instanceof ViemRpcProvider) {
    return provider.createWalletClient(account)
  }
  
  throw new Error('Provider is not a ViemRpcProvider instance')
}

/**
 * Get current chain ID
 */
export function getChainId(): number {
  return getRpcManager().getChainId()
}

/**
 * Check if mainnet mode
 */
export function isMainnet(): boolean {
  return getRpcManager().isMainnetMode()
}

/**
 * Get RPC manager instance
 */
export function getRpcManagerInstance() {
  return getRpcManager()
}

