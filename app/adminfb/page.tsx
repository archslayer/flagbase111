// app/adminfb/page.tsx
// Admin dashboard overview

'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, DollarSign, TrendingUp, Activity } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  activeUsers: number
  totalRevenue: string
  totalReferrals: number
  totalAttacks: number
  totalQuests: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/adminfb/stats')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setStats(data.stats)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load stats:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div style={{ color: 'var(--text-primary)', textAlign: 'center', padding: '2rem' }}>
        Loading dashboard...
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
        Dashboard Overview
      </h1>

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
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              {stats?.totalUsers ?? 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {stats?.activeUsers ?? 0} active
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={20} />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              ${stats?.totalRevenue ?? '0.00'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              USDC
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} />
              Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              {stats?.totalReferrals ?? 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Total referrals
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} />
              Attacks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              {stats?.totalAttacks ?? 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Total attacks
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <a href="/adminfb/users" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--bg-panel-soft)',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}>
                View Users
              </button>
            </a>
            <a href="/adminfb/revenue" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--bg-panel-soft)',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}>
                View Revenue
              </button>
            </a>
            <a href="/adminfb/referrals" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '0.75rem 1.5rem',
                background: 'var(--bg-panel-soft)',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}>
                View Referrals
              </button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

