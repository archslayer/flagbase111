"use client"
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectAndLogin } from '@/components/ConnectAndLogin'

export default function QuestsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QuestsPageContent />
    </Suspense>
  )
}

function QuestsPageContent() {
  const { address } = useAccount()
  const searchParams = useSearchParams()
  
  const [discordId, setDiscordId] = useState<string | null>(null)
  const [checkStatus, setCheckStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // OAuth URL
  const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '1434579419573518376'
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL 
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/discord`
    : 'http://localhost:3000/api/auth/callback/discord'
  
  const oauthUrl = `https://discord.com/oauth2/authorize?response_type=code&client_id=${discordClientId}&scope=identify&redirect_uri=${encodeURIComponent(redirectUri)}`

  useEffect(() => {
    const id = searchParams?.get('discordId')
    const oauthStatus = searchParams?.get('discord_oauth')
    
    if (id) setDiscordId(id)
    
    // Handle OAuth status
    if (oauthStatus === 'ok') {
      console.log('Discord OAuth success')
      setOauthError(null)
    } else if (oauthStatus?.startsWith('error')) {
      console.error('Discord OAuth error:', oauthStatus)
      const errorMessages: Record<string, string> = {
        'error_env': 'Configuration error. Please contact support.',
        'error_missing_code': 'OAuth callback failed. Please try again.',
        'token_error': 'Discord authentication failed. Please try again.',
        'user_error': 'Could not fetch Discord user info. Please try again.',
        'exception': 'An unexpected error occurred. Please try again.',
        'error': 'Discord connection failed. Please try again.'
      }
      setOauthError(errorMessages[oauthStatus] || 'Discord connection failed. Please try again.')
    } else {
      setOauthError(null)
    }
  }, [searchParams])

  const handleCheck = async () => {
    if (!address || !discordId) return

    setLoading(true)
    try {
      const res = await fetch('/api/quests/check-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: address, discordId })
      })
      const data = await res.json()
      setCheckStatus(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    if (!address || !discordId) return

    setLoading(true)
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, discordId })
      })
      const data = await res.json()
      setCheckStatus(data)
      if (data.ok) {
        setClaimed(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return null
  }

  if (!address) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            background: 'var(--bg-panel)',
            padding: '2rem',
            borderRadius: '1rem',
            border: '1px solid var(--stroke)',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h1 style={{ marginBottom: '1rem' }}>🎯 Quests</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Connect your wallet to complete quests and earn rewards
          </p>
          <ConnectAndLogin />
        </div>
      </div>
    )
  }

  const allRequirementsMet = checkStatus?.ok === true
  const discordConnected = !!discordId

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          🎯 Quests
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Complete quests to earn free attacks and special rewards
        </p>
      </div>

      {/* Quest Card */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: claimed ? '2px solid var(--gold)' : '1px solid var(--stroke)',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '2rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decoration */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '200px',
            height: '200px',
            background: 'radial-gradient(circle, rgba(255, 215, 0, 0.1) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Quest Header */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '3rem' }}>💬</div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                Communication Specialist
              </h2>
              <div
                style={{
                  display: 'inline-block',
                  background: claimed ? 'var(--gold)' : 'var(--bg-panel-soft)',
                  color: claimed ? 'var(--text-dark)' : 'var(--text-secondary)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                }}
              >
                {claimed ? '✓ Completed' : 'Active'}
              </div>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Join Flag Base Discord, hold a Flag, get the Flag Folks role to earn a free attack.
          </p>
        </div>

        {/* Rewards Badge */}
        <div
          style={{
            background: 'var(--bg-panel-soft)',
            border: '1px solid var(--stroke)',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>🎁</div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gold)' }}>
              Reward: 1 Free Attack
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Use it to attack any country
            </div>
          </div>
        </div>

        {/* Requirements List */}
        <div
          style={{
            background: 'var(--bg-panel-soft)',
            border: '1px solid var(--stroke)',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Requirements
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <RequirementItem
              icon={discordConnected ? '✅' : '⚪'}
              text="Connect Discord account"
              met={discordConnected}
            />
            <RequirementItem
              icon={checkStatus?.member ? '✅' : '⚪'}
              text="Join Flag Base Discord server"
              met={checkStatus?.member}
            />
            <RequirementItem
              icon={checkStatus?.hasRole ? '✅' : '⚪'}
              text="Get Flag Folks role"
              met={checkStatus?.hasRole}
            />
            <RequirementItem
              icon={checkStatus?.hasFlag ? '✅' : '⚪'}
              text="Own at least 1 flag"
              met={checkStatus?.hasFlag}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
          {!discordConnected ? (
            <a
              href={oauthUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--gold)',
                color: 'var(--text-dark)',
                borderRadius: '0.75rem',
                textDecoration: 'none',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#d4a017'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gold)'; }}
            >
              <span style={{ fontSize: '1.25rem' }}>🔗</span>
              Connect Discord
            </a>
          ) : (
            <>
              <button
                onClick={handleCheck}
                disabled={loading || claimed}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '1rem 1.5rem',
                  background: loading ? 'var(--bg-panel-soft)' : 'var(--bg-panel-soft)',
                  color: loading ? 'var(--text-muted)' : 'var(--text-primary)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '0.75rem',
                  cursor: loading || claimed ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!loading && !claimed) {
                    e.currentTarget.style.background = 'var(--stroke)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && !claimed) {
                    e.currentTarget.style.background = 'var(--bg-panel-soft)'
                  }
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Checking...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '1.25rem' }}>🔍</span>
                    Check Status
                  </>
                )}
              </button>

              {allRequirementsMet && !claimed && (
                <button
                  onClick={handleClaim}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.5rem',
                    background: 'var(--gold)',
                    color: 'var(--text-dark)',
                    border: 'none',
                    borderRadius: '0.75rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = '#d4a017'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = 'var(--gold)'
                    }
                  }}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      Claiming...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.25rem' }}>🎁</span>
                      Claim Free Attack
                    </>
                  )}
                </button>
              )}

              {claimed && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.5rem',
                    background: 'var(--gold)',
                    color: 'var(--text-dark)',
                    borderRadius: '0.75rem',
                    fontWeight: '600',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>✅</span>
                  Quest Completed!
                </div>
              )}
            </>
          )}
        </div>

        {/* OAuth Error Messages */}
        {oauthError && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#ff6b6b',
              textAlign: 'center',
            }}
          >
            ⚠️ {oauthError}
          </div>
        )}

        {/* Status Messages */}
        {checkStatus?.message && checkStatus?.ok !== undefined && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: allRequirementsMet ? 'rgba(255, 215, 0, 0.1)' : 'var(--bg-panel-soft)',
              border: `1px solid ${allRequirementsMet ? 'var(--gold)' : 'var(--stroke)'}`,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: allRequirementsMet ? 'var(--gold)' : 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {checkStatus.message}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--stroke)',
          borderRadius: '1rem',
          padding: '1.5rem',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
          Quest Rules
        </h3>
        <ul style={{
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          lineHeight: '1.8',
          margin: 0,
          paddingLeft: '1.5rem',
          listStyleType: 'none',
        }}>
          <li style={{ position: 'relative', paddingLeft: '1.5rem' }}>
            <span style={{ position: 'absolute', left: 0 }}>•</span>
            Maximum <strong style={{ color: 'var(--gold)' }}>2 free attacks</strong> can be claimed in total
          </li>
          <li style={{ position: 'relative', paddingLeft: '1.5rem' }}>
            <span style={{ position: 'absolute', left: 0 }}>•</span>
            Each user can claim this quest <strong style={{ color: 'var(--text-primary)' }}>only once</strong>
          </li>
          <li style={{ position: 'relative', paddingLeft: '1.5rem' }}>
            <span style={{ position: 'absolute', left: 0 }}>•</span>
            Free attacks can be used for <strong style={{ color: 'var(--text-primary)' }}>any attack action</strong>
          </li>
        </ul>
      </div>

    </div>
  )
}

function RequirementItem({ icon, text, met }: { icon: string; text: string; met: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ fontSize: '1.25rem' }}>{icon}</div>
      <div style={{
        color: met ? 'var(--gold)' : 'var(--text-secondary)',
        fontSize: '0.875rem',
        fontWeight: met ? '500' : '400',
        textDecoration: met ? 'line-through' : 'none',
      }}>
        {text}
      </div>
    </div>
  )
}
