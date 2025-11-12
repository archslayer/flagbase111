// app/adminfb/revenue/page.tsx
// Revenue dashboard page

'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DollarSign, Calendar } from 'lucide-react'

interface RevenueData {
  period: string
  revenue: {
    total: string
    totalUSDC6: string
    count: number
  }
  daily: Array<{
    date: string
    revenue: string
    count: number
  }>
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d')

  const loadRevenue = async (periodValue: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/adminfb/revenue?period=${periodValue}`)
      const revenueData = await res.json()

      if (revenueData.ok) {
        setData(revenueData)
      }
    } catch (err) {
      console.error('Failed to load revenue:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRevenue(period)
  }, [period])

  return (
    <div>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        color: 'var(--text-primary)',
        marginBottom: '2rem',
      }}>
        Revenue Dashboard
      </h1>

      {/* Period Selector */}
      <Card style={{ marginBottom: '2rem' }}>
        <CardHeader>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={20} />
            Time Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button
              onClick={() => setPeriod('7d')}
              variant={period === '7d' ? 'default' : 'outline'}
            >
              7 Days
            </Button>
            <Button
              onClick={() => setPeriod('30d')}
              variant={period === '30d' ? 'default' : 'outline'}
            >
              30 Days
            </Button>
            <Button
              onClick={() => setPeriod('all')}
              variant={period === 'all' ? 'default' : 'outline'}
            >
              All Time
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div style={{ color: 'var(--text-primary)', textAlign: 'center', padding: '2rem' }}>
          Loading revenue data...
        </div>
      ) : data ? (
        <>
          {/* Revenue Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}>
            <Card>
              <CardHeader>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <DollarSign size={20} />
                  Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                  ${data.revenue.total} USDC
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {data.revenue.count} transactions
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Breakdown */}
          {data.daily.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--stroke)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Date</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Revenue</th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Transactions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((day) => (
                        <tr key={day.date} style={{ borderBottom: '1px solid var(--stroke)' }}>
                          <td style={{ padding: '0.75rem' }}>{day.date}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--gold)', fontWeight: 'bold' }}>
                            ${day.revenue} USDC
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>{day.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {data.daily.length === 0 && (
            <Card>
              <CardContent style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No revenue data available for this period
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            Failed to load revenue data
          </CardContent>
        </Card>
      )}
    </div>
  )
}

