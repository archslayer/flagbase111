"use client"
import { useEffect, useState } from "react"

type OwnedFlag = { 
  id: number
  name: string
  balance18: bigint 
}

export function useOwnedFlags(
  allFlags: { id: number, name: string, flagImage?: string, code?: string }[], 
  wallet?: `0x${string}`,
  enabled: boolean = true
) {
  const [owned, setOwned] = useState<OwnedFlag[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    
    if (!wallet || !enabled || !allFlags?.length) {
      setOwned([])
      return
    }

    (async () => {
      setLoading(true)
      try {
        // Paralel olarak tüm flag'lerin balance'larını oku (getUserBalance tek kaynak)
        const results = await Promise.all(
          allFlags.map(async (flag) => {
            try {
              const response = await fetch(
                `/api/countries/userBalance?id=${flag.id}&wallet=${wallet}`,
                { 
                  cache: 'no-store',
                  headers: { 'cache-control': 'no-cache' }
                }
              )
              
              if (!response.ok) {
                console.warn(`Failed to fetch balance for ${flag.name}: HTTP ${response.status}`)
                return { ...flag, balance18: 0n }
              }
              
              const data = await response.json()
              if (!data?.ok) {
                console.warn(`API error for ${flag.name}:`, data?.error)
                return { ...flag, balance18: 0n }
              }
              
              const balance18 = BigInt(data?.balance18 ?? 0)
              
              return { ...flag, balance18 }
            } catch (error) {
              console.error(`Failed to fetch balance for ${flag.name}:`, error)
              return { ...flag, balance18: 0n }
            }
          })
        )

        if (!alive) return
        
        // Sadece balance > 0 olanları filtrele
        setOwned(results.filter(r => r.balance18 > 0n))
      } catch (error) {
        console.error('useOwnedFlags error:', error)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => { alive = false }
  }, [allFlags.map(f => f.id).join(','), wallet, enabled])

  return { owned, loading }
}

