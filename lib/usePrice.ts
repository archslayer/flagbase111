"use client"
import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import { CORE_ADDRESS } from '@/lib/addresses'
import { CORE_ABI } from '@/lib/core-abi'

type PriceInfo = { price8: string, usdc6: string, updatedAt: number }

export function usePrice(countryId?: number) {
  const [data, setData] = useState<PriceInfo | null>(null)
  
  // Direct on-chain read
  const { data: countryData } = useReadContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: 'countries',
    args: countryId ? [BigInt(countryId)] : undefined,
    query: {
      enabled: !!countryId,
      refetchInterval: 3000
    }
  })

  useEffect(() => {
    if (!countryData || !countryId) return
    // countryData = [name, token, exists, price8, kappa8, lambda8, priceMin8]
    const price8 = BigInt(countryData[3] ?? 0n).toString()
    const usdc6 = (BigInt(price8) / 100n).toString()
    setData({ price8, usdc6, updatedAt: Date.now() })
  }, [countryData, countryId])

  return { 
    data: data as PriceInfo | null, 
    loading: false, 
    err: null as string | null, 
    refetch: () => {} 
  }
}

