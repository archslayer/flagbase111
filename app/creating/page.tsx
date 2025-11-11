'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'

type Status = 'pending' | 'processing' | 'completed' | 'failed'

export default function CreatingPage() {
  const router = useRouter()
  const { address } = useAccount()
  const [status, setStatus] = useState<Status>('pending')
  const [elapsed, setElapsed] = useState(0)
  const [enqueuedAt, setEnqueuedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!address) {
      router.push('/')
      return
    }

    // Start onboarding
    const startOnboarding = async () => {
      try {
        const res = await fetch('/api/user/onboard', { method: 'POST' })
        const data = await res.json()
        
        if (data.ok) {
          setStatus(data.state)
        } else {
          setStatus('failed')
        }
      } catch (error) {
        console.error('Onboard error:', error)
        setStatus('failed')
      }
    }

    startOnboarding()

    // Poll status every 1.5 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/user/status')
        const data = await res.json()
        
        if (data.ok) {
          setStatus(data.state)
          
          // Store enqueued timestamp for ETA calculation
          if (data.enqueuedAt && !enqueuedAt) {
            setEnqueuedAt(data.enqueuedAt)
          }
          
          if (data.state === 'completed') {
            // Small delay for UX, then redirect
            setTimeout(() => {
              router.push('/')
            }, 1000)
          }
        }
      } catch (error) {
        console.error('Status poll error:', error)
      }
    }, 1500)

    // Track elapsed time
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(timer)
    }
  }, [address, router])

  const handleRetry = async () => {
    setStatus('pending')
    setElapsed(0)
    
    try {
      const res = await fetch('/api/user/onboard', { method: 'POST' })
      const data = await res.json()
      
      if (data.ok) {
        setStatus(data.state)
      } else {
        setStatus('failed')
      }
    } catch (error) {
      console.error('Retry error:', error)
      setStatus('failed')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center'
      }}>
        {/* Status Icon */}
        <div style={{
          fontSize: '4rem',
          marginBottom: '1.5rem',
          animation: status === 'pending' || status === 'processing' ? 'pulse 2s infinite' : 'none'
        }}>
          {status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳'}
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: 'var(--text-primary)'
        }}>
          {status === 'completed' 
            ? 'Account Created!' 
            : status === 'failed'
            ? 'Something Went Wrong'
            : 'Creating Your Account...'}
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          marginBottom: '2rem',
          lineHeight: '1.6'
        }}>
          {status === 'completed'
            ? 'Taking you to the game now...'
            : status === 'failed'
            ? 'We couldn\'t create your account. Please try again.'
            : 'This usually takes a few seconds. We\'ll take you to the game automatically.'}
        </p>

        {/* ETA Estimate */}
        {enqueuedAt && status !== 'completed' && (
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--text-tertiary)',
            marginBottom: '1.5rem'
          }}>
            Elapsed: {elapsed}s • 
            {status === 'processing' ? ' Creating account...' : ' Waiting in queue...'}
          </p>
        )}

        {/* Fallback Retry (if taking too long) */}
        {elapsed > 90 && status !== 'completed' && status !== 'failed' && (
          <button
            onClick={handleRetry}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              marginTop: '1rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            ⏰ Retry (taking too long)
          </button>
        )}

        {/* Retry Button (if failed) */}
        {status === 'failed' && (
          <button
            onClick={handleRetry}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
          >
            Try Again
          </button>
        )}

        {/* Status Indicator */}
        {status !== 'failed' && (
          <div style={{
            marginTop: '2rem',
            fontSize: '0.875rem',
            color: 'var(--text-tertiary)'
          }}>
            Status: <strong>{status}</strong>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

