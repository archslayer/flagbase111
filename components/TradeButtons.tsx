"use client"

import { useState } from 'react'

interface TradeButtonsProps {
  countryId: number
  amountToken18: string
  onSuccess?: (hash: string) => void
  onError?: (error: string) => void
}

export function TradeButtons({ countryId, amountToken18, onSuccess, onError }: TradeButtonsProps) {
  const [buyLoading, setBuyLoading] = useState(false)
  const [sellLoading, setSellLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTrade = async (type: 'buy' | 'sell') => {
    const setLoading = type === 'buy' ? setBuyLoading : setSellLoading
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/trade/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          countryId,
          amountToken18
        })
      })

      const data = await res.json()

      if (data.ok) {
        onSuccess?.(data.hash)
        // Show success toast
        console.log(`${type.toUpperCase()} successful:`, data.hash)
      } else {
        const errorMsg = data.error || `${type.toUpperCase()} failed`
        setError(errorMsg)
        onError?.(errorMsg)
      }
    } catch (err: any) {
      const errorMsg = err?.message || `${type.toUpperCase()} failed`
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleTrade('buy')}
        disabled={buyLoading || sellLoading}
        className="btn btn-primary"
        style={{ opacity: (buyLoading || sellLoading) ? 0.5 : 1 }}
      >
        {buyLoading ? 'Buying...' : 'Buy'}
      </button>
      
      <button
        onClick={() => handleTrade('sell')}
        disabled={buyLoading || sellLoading}
        className="btn btn-secondary"
        style={{ opacity: (buyLoading || sellLoading) ? 0.5 : 1 }}
      >
        {sellLoading ? 'Selling...' : 'Sell'}
      </button>

      {error && (
        <div className="text-red-500 text-sm mt-2">
          Error: {error}
        </div>
      )}
    </div>
  )
}
