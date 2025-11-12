// app/adminfb/market/page.tsx
// Market prices admin page

'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MarketPrice {
  countryId: number
  name: string
  price8: string
  priceUSDC: string
  updatedAt: string
  exists: boolean
}

export default function AdminMarketPage() {
  const [prices, setPrices] = useState<MarketPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const loadPrices = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/adminfb/market')
      const data = await res.json()

      if (data.ok) {
        setPrices(data.prices)
        setLastUpdate(new Date())
      }
    } catch (err) {
      console.error('Failed to load prices:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrices()
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadPrices, 10000)
    return () => clearInterval(interval)
  }, [])

  const formatPrice = (priceUSDC: string) => {
    const num = parseFloat(priceUSDC) / 1e6
    return num.toFixed(6)
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'var(--text-primary)',
        }}>
          Market Prices
        </h1>
        <Button onClick={loadPrices} disabled={loading} variant="outline">
          <RefreshCw size={16} style={{ marginRight: '0.5rem' }} />
          Refresh
        </Button>
      </div>

      {lastUpdate && (
        <div style={{
          marginBottom: '1rem',
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
        }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}

      {loading && prices.length === 0 ? (
        <div style={{ color: 'var(--text-primary)', textAlign: 'center', padding: '2rem' }}>
          Loading prices...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}>
          {prices.map((price) => (
            <Card key={price.countryId}>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={20} />
                  {price.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Price (USDC):
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                    {formatPrice(price.priceUSDC)} USDC
                  </div>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Country ID:
                  </div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {price.countryId}
                  </div>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Status:
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: price.exists ? 'var(--gold)' : 'var(--text-muted)',
                  }}>
                    {price.exists ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Updated:
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(price.updatedAt).toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {prices.length === 0 && !loading && (
        <Card>
          <CardContent style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No market prices available
          </CardContent>
        </Card>
      )}
    </div>
  )
}

