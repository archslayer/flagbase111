/**
 * Nonce Manager for Sequential Treasury Transactions
 * 
 * Prevents nonce collisions when CLAIM_QUEUE_CONCURRENCY > 1
 * by maintaining a local nonce sequencer.
 */

import type { PublicClient, Address } from 'viem'

let currentNonce: number | null = null
let pendingTransactions = 0

/**
 * Get next available nonce for treasury wallet
 * 
 * @param publicClient - Viem public client
 * @param treasuryAddress - Treasury wallet address
 * @returns Next sequential nonce
 */
export async function getNextNonce(
  publicClient: PublicClient,
  treasuryAddress: Address
): Promise<number> {
  // First call: fetch from chain including pending
  if (currentNonce === null) {
    currentNonce = await publicClient.getTransactionCount({
      address: treasuryAddress,
      blockTag: 'pending'
    })
  }
  
  // Return current and increment
  const nonce = currentNonce
  currentNonce++
  pendingTransactions++
  
  return nonce
}

/**
 * Mark transaction as confirmed (allows nonce refresh)
 */
export function markTransactionConfirmed(): void {
  pendingTransactions--
  
  // Reset nonce counter if no pending transactions
  // Next call will fetch fresh from chain
  if (pendingTransactions <= 0) {
    currentNonce = null
    pendingTransactions = 0
  }
}

/**
 * Force reset nonce counter (use after errors)
 */
export function resetNonceCounter(): void {
  currentNonce = null
  pendingTransactions = 0
}

/**
 * Get current nonce state (for debugging)
 */
export function getNonceState() {
  return {
    currentNonce,
    pendingTransactions
  }
}

