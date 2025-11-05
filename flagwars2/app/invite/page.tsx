"use client"

import { useEffect, useState } from "react"
import { useAccount } from "wagmi"
import { useToast } from "@/components/Toast"
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { config } from '@/app/providers'
import { CORE_ABI } from '@/lib/core-abi'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

interface ReferralMyData {
  ok: boolean
  code: string
  inviteUrl: string
  wallet: string
}

interface ReferralStats {
  totalReferrals: number
  activeReferrals: number
  accruedUSDC6: string
  claimedUSDC6: string
  claimableUSDC6: string
  lastUpdated: string
}

export default function InvitePage() {
  const { address, isConnected } = useAccount()
  const { push } = useToast()
  
  const [myData, setMyData] = useState<ReferralMyData | null>(null)
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [bindingRef, setBindingRef] = useState(false)
  const [shouldBind, setShouldBind] = useState(false)
  const [refWalletToBind, setRefWalletToBind] = useState<string>('')

  // Load referral data
  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false)
      return
    }

    let alive = true

    ;(async () => {
      setLoading(true)
      try {
        // Fetch all data in parallel for faster page load
        console.log('[Invite] Fetching all data in parallel...')
        const [myRes, statsRes, registerRes] = await Promise.all([
          fetch('/api/referral/my', { cache: 'no-store' }),
          fetch(`/api/referral/stats?wallet=${address}`, { cache: 'no-store' }),
          fetch('/api/referral/register', { method: 'POST', cache: 'no-store' }).catch(() => null)
        ])
        
        if (!alive) return
        
        // Process my code
        console.log('[Invite] My code response status:', myRes.status)
        const myJson = await myRes.json()
        console.log('[Invite] My code data:', myJson)
        if (myJson.ok) {
          setMyData(myJson)
        } else {
          console.error('[Invite] My code error:', myJson.error)
        }
        
        // Process stats
        console.log('[Invite] Stats response status:', statsRes.status)
        const statsJson = await statsRes.json()
        console.log('[Invite] Stats data:', statsJson)
        if (statsJson.ok) {
          setStats(statsJson.stats)
        } else {
          console.error('[Invite] Stats error:', statsJson.error)
        }
        
        // Process register check (optional - errors here shouldn't block page)
        if (registerRes && registerRes.ok) {
          console.log('[Invite] Register response status:', registerRes.status)
          const registerJson = await registerRes.json()
          console.log('[Invite] Register data:', registerJson)
          
          if (registerJson.ok && registerJson.shouldCallSetReferrer) {
            setShouldBind(true)
            setRefWalletToBind(registerJson.refWallet)
          }
        } else {
          console.log('[Invite] Register check returned non-200 or failed, skipping')
        }
        
      } catch (error: any) {
        console.error('[Invite] Load referral data error:', error)
        push({ type: 'error', text: 'Failed to load referral data' })
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => { alive = false }
  }, [isConnected, address, push])

  const handleCopyLink = async () => {
    if (!myData) return
    try {
      await navigator.clipboard.writeText(myData.inviteUrl)
      push({ type: 'success', text: 'Link copied!' })
    } catch {
      push({ type: 'error', text: 'Failed to copy link' })
    }
  }

  const handleShareTwitter = () => {
    if (!myData) return
    const text = encodeURIComponent('Join me on FlagWars! Conquer countries, trade flags, and earn rewards. 🚩')
    const url = encodeURIComponent(myData.inviteUrl)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=550,height=420')
  }

  const handleShareDiscord = async () => {
    if (!myData) return
    // Discord doesn't have a direct share intent, so copy with formatted message
    const message = `Join me on FlagWars! Conquer countries, trade flags, and earn rewards. 🚩\n${myData.inviteUrl}`
    try {
      await navigator.clipboard.writeText(message)
      push({ type: 'success', text: 'Message copied! Paste it in Discord.' })
    } catch {
      push({ type: 'error', text: 'Failed to copy' })
    }
  }

  const handleShareNative = async () => {
    if (!myData) return
    
    // Check if Web Share API is available
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FlagWars Invitation',
          text: 'Join me on FlagWars! Conquer countries, trade flags, and earn rewards. 🚩',
          url: myData.inviteUrl
        })
        push({ type: 'success', text: 'Shared!' })
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // Fallback to copy
          handleCopyLink()
        }
      }
    } else {
      // Fallback to copy
      handleCopyLink()
    }
  }

  // Helper to release idempotency lock (safe to call multiple times)
  const releaseLock = async () => {
    try {
      await fetch('/api/referral/unlock', { method: 'POST' })
    } catch {
      // Ignore errors - non-critical cleanup
    }
  }

  const handleBindReferrer = async () => {
    if (!refWalletToBind || !address) return
    
    setBindingRef(true)
    
    try {
      // Call setReferrer on-chain
      const hash = await writeContract(config, {
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'setReferrer',
        args: [refWalletToBind as `0x${string}`]
      })

      push({ type: 'info', text: 'Transaction sent. Waiting for confirmation...' })

      const receipt = await waitForTransactionReceipt(config, {
        hash,
        timeout: 120_000,
        pollingInterval: 2_000
      })

      if (receipt.status === 'success') {
        // Confirm on backend (this also releases the lock and clears cookie)
        await fetch('/api/referral/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txHash: hash,
            refWallet: refWalletToBind
          })
        })

        push({ type: 'success', text: 'Referrer linked on-chain!' })
        setShouldBind(false)
        
        // Optional: Release lock (idempotent, confirm already does this)
        await releaseLock()
      } else {
        push({ type: 'error', text: 'Transaction failed' })
        await releaseLock()
      }
    } catch (error: any) {
      console.error('Bind referrer error:', error)
      
      // Always release lock on error
      await releaseLock()
      
      if (error?.message?.includes('User rejected') || error?.message?.includes('User denied')) {
        push({ type: 'info', text: 'Transaction cancelled' })
      } else {
        push({ type: 'error', text: error?.message || 'Failed to bind referrer' })
      }
    } finally {
      setBindingRef(false)
    }
  }

  const handleClaim = async () => {
    if (!address) return
    
    setClaiming(true)
    try {
      const res = await fetch('/api/referral/claim', { 
        method: 'POST',
        credentials: 'include', // Include cookies (JWT)
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json()

      if (data.ok && data.queued) {
        const amountUSD = data.amountUSDC6 
          ? (Number(data.amountUSDC6) / 1_000_000).toFixed(2)
          : '0.00'
        
        push({ 
          type: 'success', 
          text: `✅ Claim Queued! ${amountUSD} USDC` 
        })
        
        setTimeout(() => {
          push({ 
            type: 'info', 
            text: '⏳ Your payment is being processed. USDC will arrive within 1-2 minutes.' 
          })
        }, 1500)
        
        setTimeout(() => {
          push({ 
            type: 'info', 
            text: '💡 Refresh the page in a minute to see your updated balance!' 
          })
        }, 3000)
        
        // Reload stats after 2 seconds
        setTimeout(() => {
          if (address) {
            fetch(`/api/referral/stats?wallet=${address}`, { cache: 'no-store' })
              .then(r => r.json())
              .then(j => {
                if (j.ok) setStats(j.stats)
              })
          }
        }, 2000)
      } else {
        // Show detailed error
        const errorMsg = data.message || data.error || 'Claim failed'
        push({ type: 'error', text: `❌ ${errorMsg}` })
        
        // Show specific guidance for common errors
        if (errorMsg.includes('no claimable')) {
          setTimeout(() => {
            push({ 
              type: 'info', 
              text: 'ℹ️  Invite friends and complete milestones to earn rewards!' 
            })
          }, 1500)
        }
      }
    } catch (error: any) {
      console.error('[Invite] Claim error:', error)
      push({ type: 'error', text: `❌ ${error?.message || 'Claim failed'}` })
    } finally {
      setClaiming(false)
    }
  }

  // Show loading state (avoid hydration mismatch)
  if (loading) {
    return (
      <div>
        <h1>👥 Invite Friends</h1>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            ⏳
          </div>
          <div>
            Loading referral data...
          </div>
        </div>
      </div>
    )
  }

  // Show not connected state
  if (!isConnected) {
    return (
      <div>
        <h1>👥 Invite Friends</h1>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
            🔒
          </div>
          <div>
            Please connect your wallet to view your referral info
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>👥 Invite Friends</h1>
      <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
        Earn 30% of your referrals' sell fees (paid automatically on-chain). Plus claim milestone bonuses here!
      </p>

      {/* Bind Referrer Alert */}
      {shouldBind && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(var(--gold-rgb), 0.1), rgba(var(--gold-rgb), 0.05))',
          border: '1px solid var(--gold)',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--gold)' }}>
            🎁 You were referred!
          </div>
          <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Link your referrer on-chain to start earning them rewards from your trades.
          </div>
          <button 
            className="btn btn-primary" 
            onClick={handleBindReferrer}
            disabled={bindingRef}
            style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
          >
            {bindingRef ? 'Linking...' : 'Link Referrer'}
          </button>
        </div>
      )}

      {/* Your Invite Link */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2>Your Invite Link</h2>
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
            Referral Code: <span style={{ color: 'var(--gold)', fontWeight: '600', fontSize: '1rem', letterSpacing: '0.1em' }}>{myData?.code || '...'}</span>
          </label>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.875rem' }}>
            Share Your Link
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              value={myData?.inviteUrl || ''}
              readOnly
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                background: 'var(--bg-panel-soft)',
                color: 'var(--text-primary)'
              }}
            />
            <button className="btn btn-primary" onClick={handleCopyLink}>
              📋 Copy
            </button>
          </div>
          
          {/* Share Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button 
              className="btn" 
              onClick={handleShareTwitter}
              style={{ 
                background: '#1DA1F2', 
                color: 'white',
                fontSize: '0.875rem',
                padding: '0.5rem 1rem',
                flex: 1,
                minWidth: '120px'
              }}
            >
              🐦 Twitter
            </button>
            <button 
              className="btn" 
              onClick={handleShareDiscord}
              style={{ 
                background: '#5865F2', 
                color: 'white',
                fontSize: '0.875rem',
                padding: '0.5rem 1rem',
                flex: 1,
                minWidth: '120px'
              }}
            >
              💬 Discord
            </button>
            <button 
              className="btn" 
              onClick={handleShareNative}
              style={{ 
                background: 'var(--bg-panel)', 
                border: '1px solid var(--stroke)',
                fontSize: '0.875rem',
                padding: '0.5rem 1rem',
                flex: 1,
                minWidth: '120px'
              }}
            >
              📤 Share
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {stats?.invitedCount || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Invited Users</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.5rem' }}>
            {stats?.activeRefCount || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Active Referrals</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {(Number(stats?.bonusClaimableTOKEN18 || 0) / 1e6).toFixed(2)} USDC
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Claimable Bonus</div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            {(Number(stats?.totalClaimedTOKEN18 || 0) / 1e6).toFixed(2)} USDC
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total Claimed</div>
        </div>
      </div>

      {/* Claim Button */}
      <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Invite bonus is claimable here (subject to limits: 1/min, 10/day)
        </div>
        <button
          className="btn btn-primary"
          onClick={handleClaim}
          disabled={claiming || Number(stats?.bonusClaimableTOKEN18 || 0) <= 0}
          style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
        >
          {claiming ? 'Claiming...' : 'Claim Bonus'}
        </button>
      </div>
    </div>
  )
}
