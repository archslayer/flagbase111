/**
 * Client-side contract error translation utility
 * Translates contract errors to user-friendly messages
 */

import { decodeErrorResult, BaseError } from 'viem'
import { CORE_ABI } from './core-abi'

export interface ContractError {
  message: string
  code?: string | number
  data?: `0x${string}`
  shortMessage?: string
  name?: string
  cause?: any
}

/**
 * Translate contract error to user-friendly message
 */
export function translateContractError(error: ContractError | Error | unknown): string {
  if (!error) return 'Unknown error occurred'

  const err = error as ContractError
  const errorMessage = err?.message || err?.shortMessage || err?.toString() || String(error)

  // User rejection patterns
  if (
    errorMessage.toLowerCase().includes('user rejected') ||
    errorMessage.toLowerCase().includes('user denied') ||
    errorMessage.toLowerCase().includes('rejected the request') ||
    errorMessage.toLowerCase().includes('user cancelled') ||
    errorMessage.toLowerCase().includes('action was rejected')
  ) {
    return 'Transaction cancelled'
  }

  // Try to decode contract error from data (safe decoding)
  // Walk error chain: error?.data ?? error?.cause?.data ?? error?.cause?.cause?.data
  let contractData: `0x${string}` | undefined
  let currentError: any = error
  
  // Walk error chain to find data
  for (let depth = 0; depth < 3 && currentError; depth++) {
    if (currentError?.data && typeof currentError.data === 'string' && currentError.data.startsWith('0x')) {
      contractData = currentError.data as `0x${string}`
      break
    }
    currentError = currentError?.cause
  }
  
  if (contractData) {
    try {
      const decoded = decodeErrorResult({ abi: CORE_ABI, data: contractData })
      return translateDecodedError(decoded.errorName, decoded.args)
    } catch {
      // If decoding fails, continue with pattern matching
      // This is safe - decodeErrorResult can throw if data is invalid
    }
  }
  
  // Try to find ContractFunctionRevertedError in BaseError chain
  // walk() returns the first error that matches the predicate, or undefined
  if (error && typeof error === 'object' && 'walk' in error) {
    try {
      const baseError = error as BaseError & { walk?: (predicate?: (e: any) => boolean) => any }
      // walk() can be called with or without predicate
      // If predicate provided, returns first matching error
      // If no predicate, returns root cause
      const revertedError = baseError.walk?.((e: any) => e.name === 'ContractFunctionRevertedError')
      if (revertedError && typeof revertedError === 'object' && 'shortMessage' in revertedError) {
        const msg = (revertedError as any).shortMessage
        if (msg && typeof msg === 'string') {
          return msg
        }
      }
    } catch {
      // walk() can throw, ignore safely
    }
  }

  // Slippage exceeded
  if (
    errorMessage.toLowerCase().includes('slippage') ||
    errorMessage.toLowerCase().includes('slippageexceeded') ||
    errorMessage.toLowerCase().includes('price changed') ||
    errorMessage.toLowerCase().includes('execution reverted: slippage')
  ) {
    return 'Price changed. Please try again with updated quote.'
  }

  // Deadline exceeded
  if (
    errorMessage.toLowerCase().includes('deadline') ||
    errorMessage.toLowerCase().includes('expired') ||
    errorMessage.toLowerCase().includes('execution reverted: deadline')
  ) {
    return 'Transaction expired. Please try again.'
  }

  // Insufficient allowance
  if (
    errorMessage.toLowerCase().includes('insufficient allowance') ||
    errorMessage.toLowerCase().includes('allowance too low') ||
    errorMessage.toLowerCase().includes('erc20: transfer amount exceeds allowance') ||
    errorMessage.toLowerCase().includes('execution reverted: allowance')
  ) {
    return 'Insufficient token allowance. Please approve first.'
  }

  // Insufficient balance
  if (
    errorMessage.toLowerCase().includes('insufficient balance') ||
    errorMessage.toLowerCase().includes('insufficient funds') ||
    errorMessage.toLowerCase().includes('erc20: transfer amount exceeds balance') ||
    errorMessage.toLowerCase().includes('execution reverted: balance') ||
    errorMessage.toLowerCase().includes('balance too low')
  ) {
    return 'Insufficient balance'
  }

  // Underpriced fee / gas
  if (
    errorMessage.toLowerCase().includes('underpriced') ||
    errorMessage.toLowerCase().includes('replacement transaction underpriced') ||
    errorMessage.toLowerCase().includes('gas price too low') ||
    errorMessage.toLowerCase().includes('max fee per gas less than block base fee')
  ) {
    return 'Transaction fee too low. Please try again.'
  }

  // Gas related errors
  if (
    errorMessage.toLowerCase().includes('gas') ||
    errorMessage.toLowerCase().includes('intrinsic gas too low') ||
    errorMessage.toLowerCase().includes('gas required exceeds allowance')
  ) {
    return 'Insufficient gas. Please increase gas limit.'
  }

  // Nonce errors
  if (
    errorMessage.toLowerCase().includes('nonce') ||
    errorMessage.toLowerCase().includes('nonce too low')
  ) {
    return 'Transaction nonce error. Please try again.'
  }

  // Execution reverted (generic contract error)
  if (
    errorMessage.toLowerCase().includes('execution reverted') ||
    errorMessage.toLowerCase().includes('revert')
  ) {
    // Try to extract revert reason if available
    const revertMatch = errorMessage.match(/execution reverted[:\s]+(.+)/i)
    if (revertMatch && revertMatch[1]) {
      return `Transaction failed: ${revertMatch[1]}`
    }
    return 'Transaction failed. Contract execution reverted.'
  }

  // Network errors
  if (
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('connection') ||
    errorMessage.toLowerCase().includes('timeout')
  ) {
    return 'Network error. Please check your connection and try again.'
  }

  // Generic fallback
  return `Transaction failed: ${errorMessage.slice(0, 100)}`
}

/**
 * Translate decoded contract error name to user-friendly message
 */
function translateDecodedError(errorName: string, args?: readonly unknown[]): string {
  const errorMap: Record<string, string> = {
    'SlippageExceeded': 'Price changed. Please try again with updated quote.',
    'DeadlineExceeded': 'Transaction expired. Please try again.',
    'InsufficientAllowance': 'Insufficient token allowance. Please approve first.',
    'InsufficientBalance': 'Insufficient balance',
    'InsufficientUSDCBalance': 'Insufficient USDC balance',
    'InsufficientTokenBalance': 'Insufficient token balance',
    'UnderpricedFee': 'Transaction fee too low. Please try again.',
    'UserRejected': 'Transaction cancelled',
    'TransferAmountExceedsBalance': 'Insufficient balance',
    'TransferAmountExceedsAllowance': 'Insufficient token allowance. Please approve first.',
    'ERC20InsufficientBalance': 'Insufficient balance',
    'ERC20InsufficientAllowance': 'Insufficient token allowance. Please approve first.',
  }

  // Check exact match first
  if (errorMap[errorName]) {
    return errorMap[errorName]
  }

  // Check partial matches
  for (const [key, message] of Object.entries(errorMap)) {
    if (errorName.toLowerCase().includes(key.toLowerCase())) {
      return message
    }
  }

  // Fallback to error name
  return `Transaction failed: ${errorName}`
}

/**
 * Check if error is user rejection
 * Supports multiple wallet providers:
 * - MetaMask: code === 4001
 * - Coinbase Wallet: code === 5001
 * - WalletConnect: ACTION_REJECTED
 * - Generic: UserRejectedRequestError, message includes 'reject'
 */
export function isUserRejection(error: ContractError | Error | unknown): boolean {
  if (!error) return false
  
  const err = error as ContractError & { code?: number | string }
  
  // Check error code (MetaMask: 4001, Coinbase: 5001)
  if (err?.code === 4001 || err?.code === 5001) {
    return true
  }
  
  // Check error name (Viem UserRejectedRequestError)
  if (err?.name === 'UserRejectedRequestError') {
    return true
  }
  
  // Check message patterns
  const errorMessage = err?.message || err?.shortMessage || err?.toString() || String(error)
  const lowerMessage = errorMessage.toLowerCase()
  
  return (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('rejected the request') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('action was rejected') ||
    lowerMessage.includes('action_rejected') ||
    lowerMessage.includes('reject')
  )
}

/**
 * Check if error is retryable (not user rejection, not insufficient balance)
 */
export function isRetryableError(error: ContractError | Error | unknown): boolean {
  if (isUserRejection(error)) return false
  
  const err = error as ContractError
  const errorMessage = err?.message || err?.shortMessage || err?.toString() || String(error)
  
  // Non-retryable errors
  const nonRetryable = [
    'insufficient balance',
    'insufficient funds',
    'transfer amount exceeds balance',
    'erc20: transfer amount exceeds balance'
  ]
  
  for (const pattern of nonRetryable) {
    if (errorMessage.toLowerCase().includes(pattern)) {
      return false
    }
  }
  
  // Retryable errors (network, gas, slippage, deadline)
  return true
}

