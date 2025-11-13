// lib/rpc/multicall.ts
// Multicall batching utilities with size limits and timeout
// NEVER: Exceed batch size limits, ignore timeouts
// ALWAYS: Batch requests, handle failures gracefully, implement retries

import { getRpcManager } from './manager'

const MAX_BATCH_SIZE = 50
const MAX_PARALLEL_BATCHES = 2
const BATCH_TIMEOUT_MS = 5_000
const MAX_BATCH_RETRIES = 1 // Never retry more than once per batch

/**
 * Chunk array into batches
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Execute multicall with batching
 */
export async function executeMulticallBatched<T = any>(
  contracts: any[]
): Promise<Array<{ success: boolean; data?: T; error?: Error }>> {
  if (contracts.length === 0) {
    return []
  }

  // Split into batches
  const batches = chunk(contracts, MAX_BATCH_SIZE)
  const results: Array<{ success: boolean; data?: T; error?: Error }> = []

  // Process batches in parallel (max 2 at a time)
  for (let i = 0; i < batches.length; i += MAX_PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + MAX_PARALLEL_BATCHES)
    
    const batchResults = await Promise.allSettled(
      parallelBatches.map(async (batch) => {
        const manager = getRpcManager()
        
        // Timeout wrapper
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Batch timeout')), BATCH_TIMEOUT_MS)
        })

        try {
          // Single retry attempt only
          const result = await Promise.race([
            manager.multicallWithFailover(batch, MAX_BATCH_RETRIES),
            timeoutPromise
          ])

          if (result.success && result.data) {
            // Process partial successes - isolate errors per call
            const errors: Array<{ idx: number; error: Error }> = []
            const decoded: any[] = []
            
            result.data.forEach((item: any, idx: number) => {
              if (item.status === 'success') {
                decoded[idx] = item.result
              } else {
                errors.push({ idx, error: new Error(String(item.error || 'Call failed')) })
              }
            })
            
            // Return partial results - successful items + error info
            return batch.map((_, idx) => {
              const errorItem = errors.find(e => e.idx === idx)
              if (errorItem) {
                return {
                  success: false,
                  error: errorItem.error
                }
              }
              return {
                success: true,
                data: decoded[idx]
              }
            })
          } else {
            // All items failed - return errors for each
            return batch.map(() => ({
              success: false,
              error: result.error || new Error('Multicall failed')
            }))
          }
        } catch (error: any) {
          // Timeout or other error
          return batch.map(() => ({
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
          }))
        }
      })
    )

    // Flatten results
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      } else {
        // If batch failed, mark all items as failed
        const batchSize = parallelBatches[Math.floor(results.length / MAX_BATCH_SIZE)]?.length || MAX_BATCH_SIZE
        for (let j = 0; j < batchSize; j++) {
          results.push({
            success: false,
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
          })
        }
      }
    })
  }

  return results
}

/**
 * Execute multicall with automatic batching
 */
export async function multicallBatched<T = any>(
  contracts: any[]
): Promise<T[]> {
  const results = await executeMulticallBatched<T>(contracts)
  
  return results.map((result, index) => {
    if (result.success && result.data !== undefined) {
      return result.data
    }
    
    // Return null or throw based on use case
    // For now, return null for failed items
    console.warn(`[Multicall] Item ${index} failed:`, result.error?.message)
    return null as T
  }).filter((item): item is T => item !== null)
}

