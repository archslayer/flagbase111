'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Image from 'next/image'
import { ACTIVE_COUNTRIES, COUNTRY_FLAG_MAP } from '@/lib/constants'

interface FlagItem {
  id: number
  name: string
  amount: number
  priceUSDC6: number
  valueUSDC6: number
}

interface InventoryResponse {
  ok: boolean
  items: FlagItem[]
  portfolioUSDC6: number // micro-USDC (1e6)
  ownedFlags: number
}

// Get flag URL by country ID (from contract) or name
function getFlagUrl(countryId: number, countryName: string): string {
  // First try: Match by ID in ACTIVE_COUNTRIES (most reliable)
  const byId = ACTIVE_COUNTRIES.find(c => c.id === countryId)
  if (byId) {
    return COUNTRY_FLAG_MAP[byId.code] || `/flags/${byId.code}.png`
  }
  
  // Second try: Match by name in ACTIVE_COUNTRIES
  const byName = ACTIVE_COUNTRIES.find(c => 
    c.name.toLowerCase() === countryName.toLowerCase()
  )
  if (byName) {
    return COUNTRY_FLAG_MAP[byName.code] || `/flags/${byName.code}.png`
  }
  
  // Fallback: Use country name to guess code
  const nameParts = countryName.split(' ')
  if (nameParts.length > 0) {
    const firstTwoChars = nameParts[0].slice(0, 2).toUpperCase()
    if (COUNTRY_FLAG_MAP[firstTwoChars]) {
      return COUNTRY_FLAG_MAP[firstTwoChars]
    }
  }
  
  // Last resort: white flag
  return '/flags/whiteflag.png'
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount()
  const [inventory, setInventory] = useState<InventoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    if (!isConnected || !address) {
      setLoading(false)
      return
    }

    const fetchInventory = async () => {
      try {
        setLoading(true)
        setError(null)
        
        console.log('[PROFILE] Fetching inventory...')
        const response = await fetch('/api/profile/inventory', {
          credentials: 'include',
          cache: 'no-store'
        })

        console.log('[PROFILE] Response status:', response.status)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        console.log('[PROFILE] Inventory data:', data)
        setInventory(data)
      } catch (err) {
        console.error('[PROFILE] Error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load inventory')
      } finally {
        setLoading(false)
      }
    }

    fetchInventory()
  }, [mounted, isConnected, address])

  if (!mounted) return null

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
          <h1 style={{ marginBottom: '1rem' }}>🔐 Connect Wallet</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            Connect your wallet to view your profile
          </p>
          <a href="/" className="btn btn-primary">
            Go to Home
          </a>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
          <h1 style={{ marginBottom: '1rem' }}>Error</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        </div>
      </div>
    )
  }

  // API returns portfolioUSDC6 as micro-USDC (1e6), convert to USD
  // Calculate total from items if available (more accurate), otherwise use portfolioUSDC6
  const portfolioValue = inventory?.items?.length 
    ? inventory.items.reduce((sum, item) => sum + (item.valueUSDC6 || 0), 0) / 1e6
    : (inventory?.portfolioUSDC6 ? inventory.portfolioUSDC6 / 1e6 : 0)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤 Profile</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Your flag portfolio
        </p>
        <div style={{
          background: 'var(--bg-panel-soft)',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          display: 'inline-block',
          border: '1px solid var(--stroke)'
        }}>
          {address}
        </div>
      </div>

      {/* Portfolio Value */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">💰 Portfolio Value</h2>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)' }}>
          ${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
        </div>
      </div>

      {/* Flag Inventory */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🏴 Flag Inventory</h2>
        </div>
        
        {!inventory?.items || inventory.items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              No flags owned yet
            </p>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Visit the Market to buy your first flag
            </p>
            <a href="/market" className="btn btn-primary">
              Go to Market
            </a>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            {inventory.items.map((flag) => (
              <div key={flag.id} style={{
                background: 'var(--bg-panel-soft)',
                borderRadius: '0.75rem',
                padding: '1rem',
                border: '1px solid var(--stroke)',
                textAlign: 'center'
              }}>
                <img
                  src={getFlagUrl(flag.id, flag.name)}
                  alt={flag.name}
                  width={64}
                  height={48}
                  style={{ borderRadius: '0.25rem', marginBottom: '0.75rem', objectFit: 'cover' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/flags/whiteflag.png'
                  }}
                />
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1rem' }}>
                  {flag.name}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  {flag.amount.toLocaleString()} tokens
                </div>
                <div style={{ color: 'var(--gold)', fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: '500' }}>
                  {flag.valueUSDC6 > 0 ? 
                    `$${(flag.valueUSDC6 / 1e6).toFixed(4)}` : 
                    '—'
                  }
                </div>
                {flag.priceUSDC6 > 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    ${(flag.priceUSDC6 / 1e6).toFixed(4)} per token
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

