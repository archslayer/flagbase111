// app/adminfb/referrals/page.tsx
// Referral statistics page

'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, TrendingUp } from 'lucide-react'

interface ReferralStats {
  totalReferrals: number
  activeReferrals: number
}

interface TopReferrer {
  wallet: string
  totalReferrals: number
  activeReferrals: number
}

interface Referral {
  userId: string
  refWallet: string
  createdAt: string
  isActive: boolean
  totalBuys: number
  totalSells: number
}

export default function AdminReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/adminfb/referrals')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setStats(data.stats)
          setTopReferrers(data.topReferrers)
          setReferrals(data.referrals)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load referrals:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ color: 'var(--text-primary)', textAlign: 'center', padding: '2rem' }}>
        Loading referral statistics...
      </div>
    )
  }

  return (
    <div>
      <h1 style={{
        fontSize: '2rem',
        fontWeight: 'bold',
        color: 'var(--text-primary)',
        marginBottom: '2rem',
      }}>
        Referral Statistics
      </h1>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} />
              Total Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              {stats?.totalReferrals ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} />
              Active Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              {stats?.activeReferrals ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers */}
      {topReferrers.length > 0 && (
        <Card style={{ marginBottom: '2rem' }}>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--stroke)' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Rank</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Wallet</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Total</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {topReferrers.map((ref, idx) => (
                    <tr key={ref.wallet} style={{ borderBottom: '1px solid var(--stroke)' }}>
                      <td style={{ padding: '0.75rem' }}>#{idx + 1}</td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {ref.wallet}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{ref.totalReferrals}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{ref.activeReferrals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Referrals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--stroke)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>User</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Referrer</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-secondary)' }}>Created</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Buys</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-secondary)' }}>Sells</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((ref, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--stroke)' }}>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {ref.userId.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                      {ref.refWallet.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {new Date(ref.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{ref.totalBuys}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{ref.totalSells}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        background: ref.isActive ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                        color: ref.isActive ? '#4ade80' : 'var(--text-muted)',
                      }}>
                        {ref.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {referrals.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No referrals found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

