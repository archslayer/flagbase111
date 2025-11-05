// Cached contract read helpers for hot-path data (server-only)
import 'server-only'
import { cacheGet, cacheSet } from './cache'
import { readContract } from 'wagmi/actions'
import { config } from '@/app/providers'
import { CORE_ABI } from './core-abi'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

function requireCoreAddr() {
  if (!CORE_ADDRESS) throw new Error('Missing NEXT_PUBLIC_CORE_ADDRESS')
  return CORE_ADDRESS
}

/**
 * Get country data with 3s cache
 */
export async function getCachedCountry(id: number) {
  const key = `country:${id}`
  const hit = await cacheGet<any>(key)
  if (hit) {
    console.log(`[CACHE] HIT country:${id}`)
    return hit
  }

  console.log(`[CACHE] MISS country:${id}`)
  const data = await readContract(config, {
    address: requireCoreAddr(),
    abi: CORE_ABI,
    functionName: 'countries',
    args: [BigInt(id)]
  })

  await cacheSet(key, data, 3) // 3s TTL
  return data
}

/**
 * Get remaining supply with 2s cache
 */
export async function getCachedRemainingSupply(id: number) {
  const key = `supply:${id}`
  const hit = await cacheGet<bigint>(key)
  if (hit !== null) {
    console.log(`[CACHE] HIT supply:${id}`)
    return hit
  }

  console.log(`[CACHE] MISS supply:${id}`)
  const data = await readContract(config, {
    address: requireCoreAddr(),
    abi: CORE_ABI,
    functionName: 'remainingSupply',
    args: [BigInt(id)]
  })

  await cacheSet(key, data, 2) // 2s TTL
  return data
}

/**
 * Get buy quote with 2s cache
 */
export async function getCachedQuoteBuy(id: number, amount18: bigint) {
  const key = `quoteBuy:${id}:${amount18.toString()}`
  const hit = await cacheGet<any>(key)
  if (hit) {
    console.log(`[CACHE] HIT quoteBuy:${id}:${amount18}`)
    return hit
  }

  console.log(`[CACHE] MISS quoteBuy:${id}:${amount18}`)
  const data = await readContract(config, {
    address: requireCoreAddr(),
    abi: CORE_ABI,
    functionName: 'quoteBuy',
    args: [BigInt(id), amount18]
  })

  await cacheSet(key, data, 2) // 2s TTL
  return data
}

/**
 * Get sell quote with 2s cache
 */
export async function getCachedQuoteSell(id: number, amount18: bigint) {
  const key = `quoteSell:${id}:${amount18.toString()}`
  const hit = await cacheGet<any>(key)
  if (hit) {
    console.log(`[CACHE] HIT quoteSell:${id}:${amount18}`)
    return hit
  }

  console.log(`[CACHE] MISS quoteSell:${id}:${amount18}`)
  const data = await readContract(config, {
    address: requireCoreAddr(),
    abi: CORE_ABI,
    functionName: 'quoteSell',
    args: [BigInt(id), amount18]
  })

  await cacheSet(key, data, 2) // 2s TTL
  return data
}

/**
 * Invalidate all cache for a specific country (after trade/attack)
 */
export async function invalidateCountryCache(id: number) {
  const { cacheDelPattern } = await import('./cache')
  await cacheDelPattern(`country:${id}*`)
  await cacheDelPattern(`supply:${id}*`)
  await cacheDelPattern(`quoteBuy:${id}*`)
  await cacheDelPattern(`quoteSell:${id}*`)
  console.log(`[CACHE] Invalidated all cache for country ${id}`)
}

