"use client"

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type SocialType = 'follow' | 'tweet'

const ALLOWED_TYPES: Record<string, SocialType> = {
  follow: 'follow',
  tweet: 'tweet',
}

export default function SocialPopupPage() {
  const params = useSearchParams()
  const type: SocialType = useMemo(() => {
    const raw = params?.get('type')?.toLowerCase() ?? ''
    return ALLOWED_TYPES[raw] ?? 'follow'
  }, [params])

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = type === 'tweet' ? 'Share on X' : 'Follow on X'
  }, [type])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    script.onerror = () => setError('Twitter widgets could not be loaded. Please try again.')
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  useEffect(() => {
    let followHandler: ((ev: any) => void) | null = null
    let tweetHandler: ((ev: any) => void) | null = null
    let cancelled = false

    function registerHandlers(twttr: any) {
      if (cancelled) return
      setReady(true)
      if (twttr?.widgets) {
        twttr.widgets.load()
      }

      followHandler = (ev: any) => {
        const opener = window.opener
        if (!opener) return
        opener.postMessage(
          {
            social: 'ok',
            type: 'follow',
            screen_name: ev?.data?.screen_name ?? null,
          },
          window.location.origin
        )
      }
      tweetHandler = (ev: any) => {
        const opener = window.opener
        if (!opener) return
        opener.postMessage(
          {
            social: 'ok',
            type: 'tweet',
            tweet_id: ev?.data?.tweet_id ?? null,
          },
          window.location.origin
        )
      }

      twttr.events.bind('follow', followHandler)
      twttr.events.bind('tweet', tweetHandler)
    }

    const interval = setInterval(() => {
      const twttr = (window as any).twttr
      if (!twttr || typeof twttr.ready !== 'function') {
        return
      }
      clearInterval(interval)
      twttr.ready(registerHandlers)
    }, 150)

    return () => {
      cancelled = true
      clearInterval(interval)
      const twttr = (window as any).twttr
      if (twttr?.events) {
        if (followHandler) twttr.events.unbind('follow', followHandler)
        if (tweetHandler) twttr.events.unbind('tweet', tweetHandler)
      }
    }
  }, [type])

  const openerMissing = typeof window !== 'undefined' && !window.opener

  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '1.5rem',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-panel, #0f172a)',
          borderRadius: '1.25rem',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          padding: '1.75rem',
          boxShadow: '0 16px 48px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          color: 'var(--text-primary, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '0.85rem',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'grid',
              placeItems: 'center',
              color: '#60a5fa',
              fontSize: '1.25rem',
            }}
          >
            {type === 'tweet' ? '✍️' : '✨'}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              {type === 'tweet' ? 'Share Flag Base' : 'Follow Flag Base'}
            </h1>
          </div>
        </div>

        {openerMissing && (
          <p
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.5,
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              color: '#fca5a5',
              textAlign: 'center',
            }}
          >
            This window should be opened from the Social Warrior quest card.
          </p>
        )}

        {error ? (
          <p
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.5,
              background: 'rgba(248, 113, 113, 0.12)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              color: '#fca5a5',
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        ) : !ready ? (
          <p
            style={{
              fontSize: '0.85rem',
              lineHeight: 1.5,
              background: 'rgba(148, 163, 184, 0.12)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              color: 'rgba(226, 232, 240, 0.8)',
              textAlign: 'center',
            }}
          >
            Loading X widgets...
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '1rem',
            borderRadius: '0.85rem',
            background: 'rgba(30, 41, 59, 0.65)',
          }}
        >
          {type === 'follow' ? (
            <a
              href="https://x.com/intent/follow?screen_name=flagbasefun"
              className="twitter-follow-button"
              data-show-count="false"
              data-size="large"
            >
              Follow @flagbasefun
            </a>
          ) : (
            <a
              href="https://x.com/intent/tweet?text=%40flagbasefun%20%23FlagBase"
              className="twitter-share-button"
              data-size="large"
              data-related="flagbasefun"
            >
              Tweet #FlagBase
            </a>
          )}
        </div>

        <p
          style={{
            fontSize: '0.85rem',
            lineHeight: 1.6,
            textAlign: 'center',
            color: 'rgba(226, 232, 240, 0.85)',
            margin: 0,
          }}
        >
          Once you {type === 'tweet' ? 'share the tweet' : 'follow the account'}, this window will inform the quest page
          automatically. You can close this popup after the action is completed.
        </p>
      </div>
    </div>
  )
}

