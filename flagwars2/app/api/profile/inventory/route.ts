import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress, formatUnits } from 'viem'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type UserBalance } from '@/lib/schemas/user-balances'
import { getRedis } from '@/lib/redis'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { ACTIVE_COUNTRIES } from '@/lib/constants'

export const runtime = 'nodejs'

const CACHE_TTL = 300 // 5 minutes

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const client = createPublicClient({ 
  chain: baseSepolia, 
  transport: http(RPC, { 
    batch: true,
    timeout: 10000,
    retryCount: 1
  })
})

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)'
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)'
])

/**
 * GET /api/profile/inventory
 * 
 * Get user's flag inventory from DB + Redis (no RPC calls).
 * Fast read path for profile page.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Auth check
    const userWallet = await getUserAddressFromJWT(req)
    console.log('[API /profile/inventory] Auth check:', { userWallet: !!userWallet })
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const userId = getAddress(userWallet)

    // 2. Check cache
    const redisClient = await getRedis()
    if (redisClient) {
      const cacheKey = `inv:${userId}`
      const cached = await redisClient.get(cacheKey)
      if (cached) {
        const data = JSON.parse(cached)
        return NextResponse.json({
          ...data,
          cached: true,
        })
      }
    }

    // 3. Get balances from DB
    const db = await getDb()
    const collection = db.collection<UserBalance>(COLLECTIONS.USER_BALANCES)
    const balances = await collection.find({ userId }).toArray()
    console.log('[API /profile/inventory] DB balances:', { userId, balancesCount: balances.length })

          // 4. If DB is empty, fallback to on-chain query (one-time migration)
      if (balances.length === 0) {
        console.log('[PROFILE] DB empty, falling back to on-chain query for migration')
        
        // Query all active countries
        const ALL_COUNTRY_IDS = ACTIVE_COUNTRIES.map(c => c.id)
        console.log('[PROFILE] Checking countries:', ALL_COUNTRY_IDS)
        
        // Get token addresses for all countries
        const tokenAddressCalls = ALL_COUNTRY_IDS.map(id => ({
          address: CORE_ADDRESS,
          abi: ABI,
          functionName: 'countries' as const,
          args: [BigInt(id)]
        }))
        
        const tokenResults = await client.multicall({ 
          contracts: tokenAddressCalls, 
          allowFailure: true 
        })
        
        // Now get balances from token contracts
        const balanceCalls = ALL_COUNTRY_IDS.map((id, i) => {
          const tokenResult = tokenResults[i]
          if (tokenResult.status === 'success') {
            const tokenAddr = tokenResult.result[1] as `0x${string}`
            return {
              address: tokenAddr,
              abi: ERC20_ABI,
              functionName: 'balanceOf' as const,
              args: [userId]
            }
          }
          return null
        }).filter(Boolean) as any[]
      
      const results = await client.multicall({ 
        contracts: balanceCalls, 
        allowFailure: true 
      })
      
      // Format as items - only for owned countries
      const items = []
      const ownedIds: number[] = []
      
      console.log('[PROFILE] On-chain results:', results.map((r, i) => ({ 
        countryId: ALL_COUNTRY_IDS[i], 
        status: r.status, 
        result: r.result?.toString() 
      })))
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const countryId = ALL_COUNTRY_IDS[i]
        
        if (result.status === 'success' && result.result > 0n) {
          ownedIds.push(countryId)
          console.log('[PROFILE] Found owned country:', countryId, 'balance:', result.result.toString())
        }
      }
      
      // Batch fetch prices (all at once!)
      if (ownedIds.length > 0) {
        // Use 'countries' function from ABI (returns: name, token, exists, price8, kappa8, lambda8, priceMin8)
        const priceCalls = ownedIds.map(id => ({
          address: CORE_ADDRESS,
          abi: ABI,
          functionName: 'countries' as const,
          args: [BigInt(id)]
        }))
        
        const priceResults = await client.multicall({ 
          contracts: priceCalls, 
          allowFailure: true 
        })
        
        for (let i = 0; i < ownedIds.length; i++) {
          const countryId = ownedIds[i]
          const balanceResult = results[ALL_COUNTRY_IDS.indexOf(countryId)]
          const priceResult = priceResults[i]
          
          if (balanceResult.status === 'success' && priceResult.status === 'success') {
            const balance18 = balanceResult.result
            // countries() returns: [name, token, exists, price8, kappa8, lambda8, priceMin8]
            const [name, _token, _exists, price8] = priceResult.result as any
            
            const priceUSDC6 = Number(price8 / 100n)
            const amount = Number(formatUnits(balance18, 18))
            // valueUSDC6 = amount (human-readable) * priceUSDC6 (micro-USDC)
            // Result is in micro-USDC (6 decimals)
            const valueUSDC6 = Math.round(amount * priceUSDC6)
            
            items.push({
              id: countryId,
              name,
              amount,
              priceUSDC6,
              valueUSDC6
            })
          }
        }
      }
      
      // Write to DB for future fast reads
      if (items.length > 0) {
        const dbWrites = items.map(item => ({
          userId,
          countryId: item.id,
          // ham 18 decimal değer (amount zaten 18 decimal olarak hesaplanmış)
          amountToken18: (BigInt(Math.round(item.amount * 1e18))).toString(), 
          amount: item.amount,
          updatedAt: new Date()
        }))
        
        await collection.insertMany(dbWrites)
        console.log(`[PROFILE] Migrated ${dbWrites.length} balances to DB`)
      }
      
      // Cache the result
      if (redisClient) {
        const cacheKey = `inv:${userId}`
        const data = {
          ok: true,
          items,
          portfolioUSDC6: items.reduce((sum, item) => sum + item.valueUSDC6, 0),
          ownedFlags: items.length,
          migrated: true
        }
        await redisClient.set(cacheKey, JSON.stringify(data), { EX: CACHE_TTL })
      }
      
      // Return migration data (with country names)
      return NextResponse.json({
        ok: true,
        items,
        portfolioUSDC6: items.reduce((sum, item) => sum + item.valueUSDC6, 0),
        ownedFlags: items.length,
        migrated: true
      })
    }

    // 5. Get prices + country names from contract (single RPC call)
    const items = []
    if (balances.length > 0) {
      // Fetch country info for owned countries (includes name and price8)
      // Use 'countries' function from ABI (returns: name, token, exists, price8, kappa8, lambda8, priceMin8)
      const countryCalls = balances.map(b => ({
        address: CORE_ADDRESS,
        abi: ABI,
        functionName: 'countries' as const,
        args: [BigInt(b.countryId)]
      }))
      
      const countryResults = await client.multicall({ 
        contracts: countryCalls, 
        allowFailure: true 
      })
      
      // Fetch prices directly from contract (always fresh, no cache)
      for (let i = 0; i < balances.length; i++) {
        const balance = balances[i]
        const countryResult = countryResults[i]
        
        // DB iki şemayı da destekle: amountToken18 varsa onu, yoksa amount kullan
        if (!balance) continue
        let amount: number
        if (balance.amountToken18) {
          amount = Number(formatUnits(balance.amountToken18, 18))
        } else if (typeof balance.amount === 'number') {
          amount = balance.amount
        } else {
          // hiçbiri yoksa bu kayıt gerçekten bozuk; atla
          continue
        }
        
        // Always fetch fresh price from contract (no cache for accuracy)
        // countries() returns: [name, token, exists, price8, kappa8, lambda8, priceMin8]
        let priceUSDC6 = null
        if (countryResult && countryResult.status === 'success') {
          const price8 = countryResult.result[3] // price8 is at index 3
          // Convert price8 (8 decimals) to priceUSDC6 (6 decimals): price8 / 100
          priceUSDC6 = price8 ? Number(price8 / 100n) : null
        }
        
        // Calculate value only if price is available
        // valueUSDC6 = amount (18 decimals) * priceUSDC6 (micro-USDC, 6 decimals)
        // Result is in micro-USDC (6 decimals)
        let valueUSDC6: number | null = null
        if (priceUSDC6 != null) {
          // amount is already in human-readable format (Number)
          // priceUSDC6 is in micro-USDC (1e6)
          // So valueUSDC6 = amount * priceUSDC6 (in micro-USDC)
          valueUSDC6 = amount * priceUSDC6
        }
        
        // Get country name with fallback
        // countries() returns: [name, token, exists, price8, kappa8, lambda8, priceMin8]
        let countryName = `Country ${balance.countryId}`
        if (countryResult && countryResult.status === 'success') {
          countryName = countryResult.result[0] || countryName // name is at index 0
        }
        
        items.push({
          id: balance.countryId,
          name: countryName,
          amount,
          priceUSDC6: priceUSDC6 ?? null,
          valueUSDC6: valueUSDC6 != null ? Math.round(valueUSDC6) : null
        })
        
        // Note: We don't cache prices here to ensure always fresh data from contract
      }
    }

    // 6. Calculate totals with null-safe handling
    // valueUSDC6 is already in micro-USDC (6 decimals) as Number
    const totalUSDC6 = items.reduce((acc, it) => {
      if (it.valueUSDC6 != null) {
        return acc + it.valueUSDC6
      }
      return acc
    }, 0)
    const ownedFlags = items.length

    // 7. Prepare response with normalized types
    const normalizedItems = items.map(it => ({
      id: it.id,
      name: it.name,
      amount: it.amount,
      priceUSDC6: it.priceUSDC6 ?? 0,
      valueUSDC6: it.valueUSDC6 ?? 0
    }))
    const response = {
      ok: true,
      items: normalizedItems,
      portfolioUSDC6: Math.round(totalUSDC6), // USDC6 integer (micro-USDC)
      ownedFlags
    }

    // 8. Cache response
    if (redisClient) {
      const cacheKey = `inv:${userId}`
      await redisClient.set(cacheKey, JSON.stringify(response), { EX: CACHE_TTL })
    }

    // 9. Add cache headers
    console.log('[API /profile/inventory] Response:', { 
      itemsCount: response.items.length, 
      ownedFlagsCount: response.ownedFlags,
      portfolioUSDC6: response.portfolioUSDC6 
    })
    const res = NextResponse.json(response)
    res.headers.set('Cache-Control', 's-maxage=5, stale-while-revalidate=20')
    return res
  } catch (error: any) {
    console.error('[API /profile/inventory] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

