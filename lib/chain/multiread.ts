// lib/chain/multiread.ts
// Bulk price reading helper (multicall with Promise.all fallback)
// NEVER: Use for quest/attack endpoints
// ALWAYS: Fallback to Promise.all if multicall unavailable

import { createPublicClient, http, type PublicClient } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ADDRESS } from '@/lib/addresses'
import { CORE_ABI } from '@/lib/core-abi'

// TODO: set RPC in env if different from default
const RPC_URL = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || process.env.ALCHEMY_BASE_SEPOLIA_URL || 'https://sepolia.base.org'

interface PriceResult {
  price8: string
  name?: string
  exists?: boolean
}

let publicClient: PublicClient | null = null

function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(RPC_URL),
    })
  }
  return publicClient
}

/**
 * Fetch prices for multiple countries using multicall if available,
 * otherwise falls back to Promise.all with individual calls
 */
export async function fetchCountryPricesBulk(ids: number[]): Promise<Record<number, PriceResult>> {
  const client = getPublicClient()
  const result: Record<number, PriceResult> = {}

  try {
    // Try multicall first
    const contracts = ids.map((id) => ({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'countries' as const,
      args: [BigInt(id)],
    }))

    const multicallResults = await client.multicall({
      contracts,
      allowFailure: true,
    })

    // Process multicall results
    multicallResults.forEach((callResult, index) => {
      const id = ids[index]
      if (callResult.status === 'success') {
        const [name, , exists, price8] = callResult.result as [
          string,
          `0x${string}`,
          boolean,
          bigint,
          number,
          number,
          bigint
        ]
        result[id] = {
          price8: price8.toString(),
          name,
          exists,
        }
      } else {
        // Multicall failed for this item, will try individual call below
        console.warn(`[MultiRead] Multicall failed for country ${id}, will retry individually`)
      }
    })

    // Retry failed items with individual calls
    const failedIndices: number[] = []
    multicallResults.forEach((callResult, index) => {
      if (callResult.status !== 'success') {
        failedIndices.push(index)
      }
    })

    if (failedIndices.length > 0) {
      const retryPromises = failedIndices.map(async (index) => {
        const id = ids[index]
        try {
          const callResult = await client.readContract({
            address: CORE_ADDRESS,
            abi: CORE_ABI,
            functionName: 'countries',
            args: [BigInt(id)],
          })
          const [name, , exists, price8] = callResult as [
            string,
            `0x${string}`,
            boolean,
            bigint,
            number,
            number,
            bigint
          ]
          result[id] = {
            price8: price8.toString(),
            name,
            exists,
          }
        } catch (error) {
          console.error(`[MultiRead] Failed to fetch price for country ${id}:`, error)
        }
      })

      await Promise.all(retryPromises)
    }
  } catch (error) {
    // Multicall not supported or failed entirely, fallback to Promise.all
    console.warn('[MultiRead] Multicall failed, falling back to Promise.all:', error)

    const promises = ids.map(async (id) => {
      try {
        const callResult = await client.readContract({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'countries',
          args: [BigInt(id)],
        })
        const [name, , exists, price8] = callResult as [
          string,
          `0x${string}`,
          boolean,
          bigint,
          number,
          number,
          bigint
        ]
        result[id] = {
          price8: price8.toString(),
          name,
          exists,
        }
      } catch (error) {
        console.error(`[MultiRead] Failed to fetch price for country ${id}:`, error)
      }
    })

    await Promise.all(promises)
  }

  return result
}

