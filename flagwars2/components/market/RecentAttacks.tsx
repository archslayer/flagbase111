'use client'

/**
 * Recent Attacks Feed Component
 * 
 * Displays last 10 attack events from Redis
 * Polls every 2 seconds with ETag support for efficiency
 */

import { useState, useEffect, useRef } from 'react'
import { attackIcon } from '@/lib/ui/flags'

// Flag image helper - map country codes to actual file names
function getFlagImage(countryCode: string): string {
  const c = (countryCode || '').toUpperCase()
  // Map special cases based on files under public/flags
  const fileMap: Record<string, string> = {
    'US': 'USA',
    'GB': 'UK',
    'ES': 'SP',
    'PT': 'POR',
    'SE': 'SW',
    'UA': 'UKR',
    'ID': 'IND',
    'AE': 'UAE',
    'AR': 'ARG',
    'MA': 'MO'
  }
  const fileName = fileMap[c] || c
  return `/flags/${fileName}.png`
}

interface AttackItem {
  attackId: string
  ts: number
  attacker: string
  attackerCountry: string
  defenderCode: string
  delta: string
  feeUSDC6: string
  txHash: string
}

const POLL_INTERVAL_MS = 2000
const FETCH_TIMEOUT_MS = 800

export default function RecentAttacks() {
  const [items, setItems] = useState<AttackItem[]>([])
  const [etag, setEtag] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    const fetchAttacks = async () => {
      try {
        // Abort previous request if still pending
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        abortControllerRef.current = new AbortController()
        const timeoutId = setTimeout(() => {
          abortControllerRef.current?.abort()
        }, FETCH_TIMEOUT_MS)

        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        }

        if (etag) {
          headers['If-None-Match'] = etag
        }

        const response = await fetch('/api/activity/attacks', {
          headers,
          signal: abortControllerRef.current.signal
        })

        clearTimeout(timeoutId)

        if (response.status === 304) {
          // No changes - keep existing items
          setError(null)
          return
        }

        if (response.status === 204) {
          // Redis not available - keep existing items, clear error
          setError(null)
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        if (data.ok && Array.isArray(data.items)) {
          setItems(data.items)
          const newEtag = response.headers.get('etag')
          if (newEtag) {
            setEtag(newEtag)
          }
          setError(null)
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Timeout or manual abort - silent, will retry
          return
        }
        
        console.warn('[RecentAttacks] Fetch error:', err.message)
        setError(err.message)
        // Keep previous items on error
      }
    }

    // Initial fetch
    fetchAttacks()

    // Poll every 2 seconds
    intervalId = setInterval(fetchAttacks, POLL_INTERVAL_MS)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [etag])

  if (!items.length && !error) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Attacks</h3>
        <p className="text-sm text-gray-400">No recent attacks yet</p>
      </div>
    )
  }

  return (
    <div className="card recent-attacks">
      <div className="card-header">
        <h3>⚔️ Recent Battles</h3>
      </div>
      
      {items.length === 0 && !error ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '2rem 1rem',
          color: 'var(--text-muted)',
          fontSize: '0.875rem'
        }}>
          No battles yet
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              {items.map((item, index) => (
                <tr 
                  key={item.attackId}
                  style={{
                    animation: index === 0 ? 'slideIn 0.3s ease-out' : 'none'
                  }}
                >
                  <td style={{ 
                    width: '60px',
                    textAlign: 'center',
                    padding: '0.5rem'
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <img 
                        src={getFlagImage(item.attackerCountry)}
                        alt={item.attackerCountry}
                        title={item.attackerCountry}
                        style={{
                          width: 'var(--flag-w, 48px)',
                          height: 'var(--flag-h, 36px)',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid var(--stroke)',
                          display: 'inline-block'
                        }}
                      />
                      <span style={{ marginLeft: '6px', fontSize: '1rem' }} title="attacker">
                        ⬆️
                      </span>
                    </span>
                  </td>
                  <td style={{ 
                    fontFamily: 'monospace',
                    fontSize: 'var(--wallet-fs, 0.875rem)',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    paddingRight: 'var(--wallet-pr, 0.75rem)'
                  }}>
                    {item.attacker.slice(0, 8)}..
                  </td>
                  <td style={{ 
                    width: 'var(--sword-w, 72px)',
                    textAlign: 'center',
                    fontSize: 'var(--sword-fs, 1.35rem)',
                    padding: '0 0.5rem'
                  }}>
                    <span aria-label="attack">{attackIcon}</span>
                  </td>
                  <td style={{ 
                    width: '60px',
                    textAlign: 'center',
                    padding: '0.5rem'
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <img 
                        src={getFlagImage(item.defenderCode)}
                        alt={item.defenderCode}
                        title={item.defenderCode}
                        style={{
                          width: 'var(--flag-w, 48px)',
                          height: 'var(--flag-h, 36px)',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid var(--stroke)',
                          display: 'inline-block'
                        }}
                      />
                      <span style={{ marginLeft: '6px', fontSize: '1rem' }} title="defender">
                        ⬇️
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (max-width: 480px) {
          .recent-attacks {
            --flag-w: 36px;
            --flag-h: 27px;
            --wallet-fs: 0.78rem;
            --wallet-pr: 0.5rem;
            --sword-w: 56px;
            --sword-fs: 1.2rem;
          }
          .recent-attacks .data-table {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}

