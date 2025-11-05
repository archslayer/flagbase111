// lib/tx-sim.ts
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ABI } from '@/lib/core-abi'
import { CORE_ADDRESS } from '@/lib/addresses'

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

// Check if error is SlippageExceeded or minOut issue
function isSlip(err: any): boolean {
  const m = String(err?.shortMessage || err?.message || '')
  return /SlippageExceeded/i.test(m) || /insufficient allowance/i.test(m) || /minOut/i.test(m)
}

/**
 * Translate contract error messages to user-friendly text
 */
export function translateError(error: any): string {
  const msg = String(error?.shortMessage || error?.message || 'Unknown error')
  
  if (/SlippageExceeded/i.test(msg)) {
    return 'Price changed. Please try again.'
  }
  if (/InsufficientBalance/i.test(msg)) {
    return 'Insufficient balance for this transaction.'
  }
  if (/InsufficientTreasuryUSDC/i.test(msg)) {
    return 'Treasury has insufficient funds. Try smaller amount.'
  }
  if (/InsufficientSupply/i.test(msg)) {
    return 'Not enough tokens available. Try smaller amount.'
  }
  if (/ErrInvalidCountry/i.test(msg)) {
    return 'Invalid country selected.'
  }
  if (/ErrDeadline/i.test(msg)) {
    return 'Transaction expired. Please try again.'
  }
  if (/ErrAmountZero/i.test(msg)) {
    return 'Amount must be greater than zero.'
  }
  if (/ErrTxAmountTooLarge/i.test(msg)) {
    return 'Amount is too large. Try smaller amount.'
  }
  if (/insufficient allowance/i.test(msg)) {
    return 'Please approve USDC first.'
  }
  
  return msg
}

/**
 * Find the minimum maxInUSDC6 that contract will accept using binary search
 * This bypasses formula drift - the contract itself is the single source of truth
 * 
 * @param countryId - Country ID to buy
 * @param amountToken18 - Amount of tokens to buy in token18 units
 * @param deadline - Transaction deadline
 * @param account - User's address
 * @param headroomBps - Safety margin (e.g. 100n = +1%, 200n = +2%)
 * @returns Minimum maxInUSDC6 that will pass contract validation
 */
export async function findRequiredMaxInUSDC6(
  countryId: number,
  amountToken18: bigint,
  deadline: bigint,
  account: `0x${string}`,
  headroomBps = 100n // +1% default safety margin
): Promise<bigint> {
  const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

  // Phase 1: Exponential search to find upper bound
  // Start small and double until we find a value that passes
  let lo = 0n
  let hi = 1_000_000n // Start from 1 USDC
  
  for (let i = 0; i < 40; i++) {
    try {
      await pc.simulateContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'buy',
        args: [BigInt(countryId), amountToken18, hi, deadline],
        account,
      })
      console.log(`[TX-SIM] Upper bound found: ${hi.toString()}`)
      break // hi is sufficient
    } catch (e: any) {
      if (!isSlip(e)) throw e // If not slippage error, propagate it
      lo = hi + 1n
      hi = hi * 2n
      
      // Safety: prevent infinite loop
      if (hi > 10_000_000_000_000n) {
        throw new Error('Quote exploded; check contract/addresses.')
      }
    }
  }

  // Phase 2: Binary search to find minimum acceptable value
  let ans = hi
  while (hi - lo > 10n) {
    const mid = (lo + hi) >> 1n
    try {
      await pc.simulateContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'buy',
        args: [BigInt(countryId), amountToken18, mid, deadline],
        account,
      })
      ans = mid
      hi = mid
    } catch (e: any) {
      if (!isSlip(e)) throw e
      lo = mid + 1n
    }
  }

  // Phase 3: Add small safety margin (headroom)
  const withHeadroom = (ans * (10_000n + headroomBps)) / 10_000n
  
  console.log(`[TX-SIM] Min required: ${ans.toString()}, with headroom: ${withHeadroom.toString()}`)
  
  return withHeadroom
}

/**
 * Find the maximum minOutUSDC6 that contract will accept for SELL
 * This ensures the user receives at least this amount
 * 
 * @param countryId - Country ID to sell
 * @param amountToken18 - Amount of tokens to sell in token18 units
 * @param deadline - Transaction deadline
 * @param account - User's address
 * @param cushionBps - Safety margin to reduce (e.g. 100n = -1%, 200n = -2%)
 * @returns Maximum minOutUSDC6 that will pass contract validation
 */
export async function findMinimumProceedsUSDC6(
  countryId: number,
  amountToken18: bigint,
  deadline: bigint,
  account: `0x${string}`,
  cushionBps = 200n // -2% default cushion
): Promise<bigint> {
  const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

  // Phase 1: Find lower bound by trying minOut = 0
  let lo = 0n
  let hi = 10_000_000n // Start from 10 USDC
  
  for (let i = 0; i < 40; i++) {
    try {
      await pc.simulateContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'sell',
        args: [BigInt(countryId), amountToken18, lo, deadline],
        account,
      })
      console.log(`[TX-SIM SELL] Lower bound confirmed: ${lo.toString()}`)
      break // minOut = 0 is acceptable
    } catch (e: any) {
      if (!isSlip(e)) throw e
      // If 0 doesn't work, we need to adjust
      hi = 1_000_000n
      break
    }
  }

  // Phase 2: Binary search to find maximum acceptable minOut
  let ans = lo
  while (hi - lo > 10n) {
    const mid = (lo + hi) >> 1n
    try {
      await pc.simulateContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'sell',
        args: [BigInt(countryId), amountToken18, mid, deadline],
        account,
      })
      ans = mid
      lo = mid + 1n
    } catch (e: any) {
      if (!isSlip(e)) throw e
      hi = mid - 1n
    }
  }

  // Phase 3: Apply cushion (reduce minOut for safety)
  const withCushion = ans > cushionBps ? (ans * (10_000n - cushionBps)) / 10_000n : ans
  
  console.log(`[TX-SIM SELL] Max proceeds: ${ans.toString()}, with cushion: ${withCushion.toString()}`)
  
  return withCushion
}
