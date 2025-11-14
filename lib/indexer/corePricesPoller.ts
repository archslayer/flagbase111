// lib/indexer/corePricesPoller.ts
// Mini Indexer: Polls Core contract for country prices and stores in memory
// NEVER: Import-time side effects, client bundle inclusion
// ALWAYS: Server-side only, graceful error handling, preserve old data on failure

import { CORE_ADDRESS } from '@/lib/addresses'
import { CORE_ABI } from '@/lib/core-abi'
import { getDb } from '@/lib/mongodb'

// Configurable country IDs to poll
const COUNTRY_IDS = [90, 44, 1] // Turkey, UK, US

// Polling interval (3 seconds - aligned with cache TTL of 2s)
const POLL_INTERVAL_MS = process.env.PRICE_POLL_INTERVAL_MS
  ? parseInt(process.env.PRICE_POLL_INTERVAL_MS)
  : 3000 // 3 seconds default (cache TTL is 2s, ensuring fresh data)

// Snapshot interval (10 minutes default)
const SNAPSHOT_INTERVAL_MS = process.env.PRICE_SNAPSHOT_INTERVAL_MS
  ? parseInt(process.env.PRICE_SNAPSHOT_INTERVAL_MS)
  : 600_000 // 10 minutes default

// When deploying to production, reduce interval to 60_000 (1 minute)

interface PriceData {
  price8: string
  updatedAt: Date
  name?: string
  exists?: boolean
}

// In-memory price storage
const latestCorePrices: Map<number, PriceData> = new Map()

let pollerInterval: NodeJS.Timeout | null = null
let snapshotInterval: NodeJS.Timeout | null = null
let isInitialized = false
let initializationPromise: Promise<void> | null = null

// Export isInitialized for health checks
export function getIndexerStatus() {
  return {
    isInitialized,
    lastUpdate: latestCorePrices.size > 0 
      ? Array.from(latestCorePrices.values())[0]?.updatedAt || null
      : null,
    countryCount: latestCorePrices.size,
  }
}

// Public client for reading from chain
// Use helper from multiread to ensure consistent typing
import { getPublicClient } from '../chain/multiread'

/**
 * Fetch price for a single country from chain
 */
async function fetchCountryPrice(id: number): Promise<PriceData | null> {
  try {
    const client = getPublicClient()
    const result = await client.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'countries',
      args: [BigInt(id)],
    })

    // Result is a tuple: [name, token, exists, price8, kappa8, lambda8, priceMin8]
    const [name, , exists, price8] = result as [string, `0x${string}`, boolean, bigint, number, number, bigint]

    return {
      price8: price8.toString(),
      updatedAt: new Date(),
      name,
      exists,
    }
  } catch (error) {
    console.error(`[PriceIndexer] Failed to fetch price for country ${id}:`, error)
    return null
  }
}

/**
 * Poll all configured countries and update in-memory storage
 */
async function pollPrices(): Promise<void> {
  const promises = COUNTRY_IDS.map(async (id) => {
    const data = await fetchCountryPrice(id)
    if (data) {
      latestCorePrices.set(id, data)
    }
    // On failure, keep old data (don't delete)
  })

  await Promise.all(promises)
}

/**
 * Initialize the price poller
 * This function is idempotent - multiple calls will only initialize once
 * Uses a promise guard to prevent concurrent initialization attempts
 */
export async function startPricePoller(): Promise<void> {
  // If already initialized, return immediately
  if (isInitialized) {
    return
  }

  // If initialization is in progress, wait for it to complete
  if (initializationPromise) {
    return initializationPromise
  }

  // Start initialization and store the promise
  initializationPromise = (async () => {
    try {
      console.log(`[PriceIndexer] Started (PID=${process.pid})`)
      console.log(`[PriceIndexer] Starting poller (interval: ${POLL_INTERVAL_MS}ms, countries: ${COUNTRY_IDS.join(', ')})`)

      // Initial poll
      await pollPrices()

      // Set up periodic polling
      pollerInterval = setInterval(async () => {
        await pollPrices()
      }, POLL_INTERVAL_MS)

      // Initialize MongoDB collection and index (using global singleton getDb())
      // This is safe because getDb() reuses the same client connection
      try {
        const db = await getDb()
        await db.createCollection('price_snapshots').catch(() => {})
        await db.collection('price_snapshots').createIndex({ ts: 1 })
        console.log('[PriceIndexer] MongoDB collection and index ensured')
      } catch (error) {
        console.error('[PriceIndexer] Failed to ensure MongoDB collection:', error)
      }

      // Set up periodic snapshots
      snapshotInterval = setInterval(async () => {
        await saveSnapshot()
      }, SNAPSHOT_INTERVAL_MS)

      // Initial snapshot after first poll
      setTimeout(async () => {
        await saveSnapshot()
      }, 5000) // Wait 5 seconds for initial data

      isInitialized = true
    } catch (error) {
      // Reset initialization promise on error so it can be retried
      initializationPromise = null
      throw error
    }
  })()

  return initializationPromise
}

/**
 * Stop the price poller
 */
export function stopPricePoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval)
    pollerInterval = null
  }
  if (snapshotInterval) {
    clearInterval(snapshotInterval)
    snapshotInterval = null
  }
  isInitialized = false
  initializationPromise = null
  console.log('[PriceIndexer] Stopped')
}

/**
 * Get latest price for a country ID
 */
export function getLatestCorePrice(id: number): PriceData | null {
  return latestCorePrices.get(id) || null
}

/**
 * Get all latest prices
 */
export function getAllLatestCorePrices(): Record<number, PriceData> {
  const result: Record<number, PriceData> = {}
  latestCorePrices.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Save current prices to MongoDB as a snapshot
 */
async function saveSnapshot(): Promise<void> {
  try {
    const prices = getAllLatestCorePrices()
    if (Object.keys(prices).length === 0) {
      console.log('[PriceIndexer] Skipping snapshot - no prices available')
      return
    }

    const db = await getDb()
    const snapshot = {
      ts: new Date(),
      prices: Object.fromEntries(
        Object.entries(prices).map(([id, data]) => [
          id,
          {
            price8: data.price8,
            updatedAt: data.updatedAt,
            ...(data.name && { name: data.name }),
            ...(data.exists !== undefined && { exists: data.exists }),
          },
        ])
      ),
    }

    await db.collection('price_snapshots').insertOne(snapshot)
    const entryCount = Object.keys(prices).length
    console.log(`[PriceIndexer] Snapshot saved at ${snapshot.ts.toISOString()} with ${entryCount} entries`)
  } catch (error) {
    console.error('[PriceIndexer] Failed to save snapshot:', error)
  }
}

// NOTE: Auto-start removed to prevent multiple instances in serverless environments
// Poller is started via route-level guards in /api/market/prices and /api/market/stream
// This ensures only one instance per server process, not per module import

