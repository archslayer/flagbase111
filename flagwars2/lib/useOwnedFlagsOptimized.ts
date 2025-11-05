"use client"
import { useEffect, useState, useMemo } from "react"

type OwnedFlag = { 
  id: number
  name: string
  balance18: bigint
  price8: bigint
}

export function useOwnedFlagsOptimized(
  allFlags: { id: number; name: string; flagImage?: string; code?: string }[], 
  wallet?: `0x${string}`,
  enabled: boolean = true
) {
  const [owned, setOwned] = useState<OwnedFlag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable dependency: extract IDs once
  const ids = useMemo(() => allFlags.map(f => f.id), [allFlags])

  useEffect(() => {
    let alive = true
    
    if (!wallet || !enabled || ids.length === 0) {
      setOwned([])
      setLoading(false)
      return
    }

    (async () => {
      setLoading(true)
      setError(null)
      try {
        // Use new inventory API (DB+Redis, no RPC for owned check)
        const res = await fetch('/api/profile/inventory', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        })

        if (!res.ok) {
          // If auth fails, return empty array (don't throw error)
          if (res.status === 401) {
            setOwned([])
            setLoading(false)
            return
          }
          throw new Error(`HTTP ${res.status}`)
        }

        const data = await res.json()
        if (!alive || !data?.ok) return

        // Filter owned flags that match our allFlags list
        const results: OwnedFlag[] = data.items
          .filter((it: any) => ids.includes(it.id)) // Only include flags we care about
          .map((it: any) => ({
            id: it.id,
            name: it.name || allFlags.find(a => a.id === it.id)?.name || `Country ${it.id}`,
            balance18: BigInt(Math.floor(it.amount * 1e18)),
            price8: BigInt(Math.floor(it.priceUSDC6 * 1e8))
          }))
          .filter((r: OwnedFlag) => r.balance18 > 0n)

        setOwned(results)
      } catch (e: any) {
        if (alive) {
          console.error('useOwnedFlagsOptimized error:', e)
          setError(e?.message || 'FETCH_FAILED')
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => { alive = false }
  }, [wallet, enabled, ids]) // Stable deps - no join hack needed

  return { owned, loading, error }
}

