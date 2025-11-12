// app/api/market/prices/route.ts
// Public market prices endpoint
// NEVER: Modify quest/free-attack endpoints, add auth
// ALWAYS: Use cache → indexer → chain fallback, return typed responses

import { NextRequest, NextResponse } from 'next/server'
import { getCachedPrice, setCachedPrice } from '@/lib/cache/shortLived'
import { getLatestCorePrice, getAllLatestCorePrices, startPricePoller } from '@/lib/indexer/corePricesPoller'
import { fetchCountryPricesBulk } from '@/lib/chain/multiread'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Route-first-start: Ensure poller is started when this route is first accessed
// This is idempotent (startPricePoller checks isInitialized internally)
let pollerStarted = false
if (!pollerStarted) {
  startPricePoller().catch((error) => {
    console.error('[MarketPrices] Failed to start price poller:', error)
  })
  pollerStarted = true
}

interface PriceResponse {
  id: number
  price8: string
  updatedAt: string
  name?: string
  exists?: boolean
  source: 'cache' | 'indexer' | 'chain' | 'chain-miss'
}

/**
 * GET /api/market/prices?id=90,44,1
 * Returns prices for specified country IDs
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limit: 60 req/min per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const rl = await checkRateLimit(`market:prices:${ip}`, 60, 60)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: 60 },
        { 
          status: 429, 
          headers: { 
            'Retry-After': '60',
            'X-RateLimit-Remaining': String(rl.remaining),
            'X-RateLimit-Reset': String(rl.resetTime)
          } 
        }
      )
    }

    // Ensure poller is started (guard check)
    if (!pollerStarted) {
      await startPricePoller().catch((error) => {
        console.error('[MarketPrices] Failed to start price poller:', error)
      })
      pollerStarted = true
    }

    const searchParams = request.nextUrl.searchParams
    const idsParam = searchParams.get('id')

    if (!idsParam) {
      return NextResponse.json(
        { error: 'Missing id parameter. Usage: /api/market/prices?id=90,44,1' },
        { status: 400 }
      )
    }

    // Parse country IDs
    const ids = idsParam
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id) && id > 0)

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Invalid country IDs' }, { status: 400 })
    }

    const results: PriceResponse[] = []

    // Process each ID with cache → indexer → chain fallback
    for (const id of ids) {
      const cacheKey = `market:price:${id}`

      // 1. Check cache first
      const cached = await getCachedPrice(cacheKey)
      if (cached) {
        results.push({
          id,
          ...cached,
          source: 'cache',
        })
        continue
      }

      // 2. Check indexer (in-memory)
      const indexed = getLatestCorePrice(id)
      if (indexed) {
        const response: PriceResponse = {
          id,
          price8: indexed.price8,
          updatedAt: indexed.updatedAt.toISOString(),
          source: 'indexer',
        }
        if (indexed.name) response.name = indexed.name
        if (indexed.exists !== undefined) response.exists = indexed.exists

        // Store in cache for next time
        await setCachedPrice(cacheKey, {
          price8: indexed.price8,
          updatedAt: indexed.updatedAt.toISOString(),
          name: indexed.name,
          exists: indexed.exists,
        })

        results.push(response)
        continue
      }

      // 3. Fallback to direct chain read (if indexer hasn't populated yet)
      try {
        const chainPrices = await fetchCountryPricesBulk([id])
        const chainData = chainPrices[id]

        if (chainData) {
          const response: PriceResponse = {
            id,
            price8: chainData.price8,
            updatedAt: new Date().toISOString(),
            source: 'chain',
          }
          if (chainData.name) response.name = chainData.name
          if (chainData.exists !== undefined) response.exists = chainData.exists

          // Store in cache
          await setCachedPrice(cacheKey, {
            price8: chainData.price8,
            updatedAt: new Date().toISOString(),
            name: chainData.name,
            exists: chainData.exists,
          })

          results.push(response)
        } else {
          // Not found on chain
          results.push({
            id,
            price8: '0',
            updatedAt: new Date().toISOString(),
            source: 'chain-miss',
          })
        }
      } catch (error) {
        console.error(`[MarketPrices] Failed to fetch from chain for ${id}:`, error)
        results.push({
          id,
          price8: '0',
          updatedAt: new Date().toISOString(),
          source: 'chain-miss',
        })
      }
    }

    return NextResponse.json({ prices: results }, { status: 200 })
  } catch (error) {
    console.error('[MarketPrices] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Test note: /api/market/prices?id=90,44,1 çağrılınca prices array dönmeli
// Her price objesi: { id, price8, updatedAt, source, name?, exists? }

