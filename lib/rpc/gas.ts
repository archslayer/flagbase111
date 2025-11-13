// lib/rpc/gas.ts
// Gas estimation and fee calculation utilities
// NEVER: Use hardcoded gas prices, ignore EIP-1559
// ALWAYS: Implement fallback strategies, add padding for safety

import { getRpcManager } from './manager'
import type { FeeData } from './provider'

export interface GasEstimate {
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  gasPrice?: bigint
}

// All gas values in BigInt (Gwei * 1e9)
const GWEI = 1_000_000_000n
const MIN_PRIORITY_FEE = 100_000_000n // 0.1 gwei
const MAX_PRIORITY_FEE = 300_000_000n // 0.3 gwei
const DEFAULT_PRIORITY_FEE = 200_000_000n // 0.2 gwei
const GAS_PADDING_PERCENT = 15n // 15% padding for safety

/**
 * Clamp priority fee to safe bounds (pure BigInt)
 */
function clampPriorityFee(x?: bigint): bigint {
  if (x == null || x === 0n) {
    return DEFAULT_PRIORITY_FEE
  }
  if (x < MIN_PRIORITY_FEE) {
    return MIN_PRIORITY_FEE
  }
  if (x > MAX_PRIORITY_FEE) {
    return MAX_PRIORITY_FEE
  }
  return x
}

/**
 * Get fee data with fallback strategy (pure BigInt)
 */
export async function getFeeData(): Promise<FeeData> {
  const manager = getRpcManager()
  const result = await manager.getFeeDataWithFailover()

  if (result.success && result.data) {
    // Ensure values are properly clamped
    return {
      maxFeePerGas: result.data.maxFeePerGas,
      maxPriorityFeePerGas: clampPriorityFee(result.data.maxPriorityFeePerGas),
      gasPrice: result.data.gasPrice
    }
  }

  // Fallback: Use fixed priority fee (pure BigInt)
  return {
    maxFeePerGas: DEFAULT_PRIORITY_FEE * 2n, // Conservative estimate
    maxPriorityFeePerGas: DEFAULT_PRIORITY_FEE,
    gasPrice: DEFAULT_PRIORITY_FEE
  }
}

/**
 * Estimate gas with padding (pure BigInt)
 */
export async function estimateGasWithPadding(
  estimateFn: () => Promise<bigint>
): Promise<bigint> {
  try {
    const estimatedGas = await estimateFn()
    // Add 15% padding (pure BigInt math)
    const paddedGas = (estimatedGas * (100n + GAS_PADDING_PERCENT)) / 100n
    return paddedGas
  } catch (error) {
    // If estimation fails, return a conservative default
    console.warn('[Gas] Estimation failed, using default:', error)
    return 200_000n // Conservative default
  }
}

/**
 * Calculate EIP-1559 fees (pure BigInt)
 */
export function calculateEIP1559Fees(baseFee: bigint, priorityFee?: bigint): FeeData {
  // Clamp priority fee to safe bounds
  const clampedPriorityFee = clampPriorityFee(priorityFee)

  // Max fee = baseFee * 1.2 + priorityFee (pure BigInt math)
  const maxFeePerGas = baseFee > 0n
    ? (baseFee * 120n / 100n) + clampedPriorityFee
    : clampedPriorityFee * 2n

  return {
    maxFeePerGas,
    maxPriorityFeePerGas: clampedPriorityFee,
    gasPrice: baseFee > 0n ? undefined : clampedPriorityFee
  }
}

/**
 * Get complete gas estimate with fees
 */
export async function getGasEstimate(
  estimateFn: () => Promise<bigint>,
  priorityFeeOverride?: bigint
): Promise<GasEstimate> {
  const [gasLimit, feeData] = await Promise.all([
    estimateGasWithPadding(estimateFn),
    priorityFeeOverride ? Promise.resolve({
      maxFeePerGas: priorityFeeOverride * 2n,
      maxPriorityFeePerGas: priorityFeeOverride,
      gasPrice: undefined
    }) : getFeeData()
  ])

  return {
    gasLimit,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    gasPrice: feeData.gasPrice
  }
}

