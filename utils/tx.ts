import { waitForTransactionReceipt } from 'wagmi/actions'
import { createPublicClient, http, type PublicClient } from 'viem'
import { baseSepolia } from 'viem/chains'
import { config } from '@/app/providers'

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

/**
 * Safe wrapper for waitForTransactionReceipt with fallback polling
 * Handles RPC "header not found" errors by polling manually
 */
export async function waitReceiptSafe(
  hash: `0x${string}`,
  options?: {
    confirmations?: number
    pollingInterval?: number
    timeout?: number
  }
) {
  const {
    confirmations = 1,
    pollingInterval = 1500,
    timeout = 120_000
  } = options || {}

  try {
    return await waitForTransactionReceipt(config, {
      hash,
      confirmations,
      pollingInterval,
      timeout
    })
  } catch (e: any) {
    const msg = String(e?.message || '')
    const isHeaderNotFound =
      msg.includes('header not found') ||
      msg.includes('Missing or invalid parameters') ||
      e?.name === 'InvalidInputRpcError' ||
      msg.includes('query returned no results')

    if (!isHeaderNotFound) throw e

    // Fallback polling: 60 seconds (30 iterations × 2 seconds)
    for (let i = 0; i < 30; i++) {
      try {
        const rcpt = await pub.getTransactionReceipt({ hash })
        if (rcpt) return rcpt
      } catch {
        // Ignore individual polling errors
      }
      await new Promise((r) => setTimeout(r, 2000))
    }

    // Last resort: throw original error
    throw e
  }
}
