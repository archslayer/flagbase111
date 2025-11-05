"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage, type Connector } from 'wagmi'
import { useRouter, useSearchParams } from 'next/navigation'
import { requireBaseSepolia } from '@/lib/chain-guard'
import { BASE_SEPOLIA_ID } from '@/lib/chains'

export function ConnectAndLogin() {
  const router = useRouter()
  const params = useSearchParams()
  const target = params.get('r') || '/market'

  const { address, isConnected } = useAccount()
  const { connect, connectAsync, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  // Diagnostic: Connector availability
  const connectorStatus = {
    available: connectors?.length || 0,
    ready: connectors?.filter(c => (c as any).ready !== false).length || 0,
    types: connectors?.map(c => c.id) || []
  }

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const loginInFlight = useRef(false) // Login işleminin şu anda çalışıp çalışmadığını takip et

  // Hydration error'unu önlemek için client-side mounting'i bekle
  useEffect(() => {
    setMounted(true)
    
    // Cleanup function - component unmount olduğunda busy state'i sıfırla
    return () => {
      setBusy(false)
      loginInFlight.current = false
    }
  }, [])

  // Session kontrolü - sayfa yüklenince /api/me ile kontrol et
  useEffect(() => {
    if (!mounted) return
    
    async function checkSession() {
      try {
        const res = await fetch('/api/me', {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' }
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.wallet) {
            setIsLoggedIn(true)
            // Eğer busy state açıksa kapat
            if (busy) setBusy(false)
          }
        }
      } catch {
        // Session yok, normal
      }
    }
    
    checkSession()
  }, [mounted])


  // İmza gerekli mi kontrol et (session-wallet match)
  async function shouldSignNow(addr?: string) {
    if (!addr) return true
    try {
      const r = await fetch('/api/me', {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' }
      })
      if (!r.ok) return true
      const me = await r.json().catch(() => ({}))
      return !me?.wallet || String(me.wallet).toLowerCase() !== String(addr).toLowerCase()
    } catch {
      return true
    }
  }

  const performLogin = useCallback(async (addr?: `0x${string}`) => {
    const useAddr = (addr ?? address) as `0x${string}` | undefined
    if (!useAddr || loginInFlight.current) return
    loginInFlight.current = true
    setErr(null)
    setBusy(true)
    
    try {
      // İMZADAN ÖNCE AĞ DOĞRULAMA
      await requireBaseSepolia()

      const w = useAddr.toLowerCase()

      // 1) nonce
      const n = await fetch('/api/auth/nonce', {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' }
      })
      if (!n.ok) throw new Error('Failed to get nonce')
      const { nonce } = await n.json()

      // 2) SIWE-benzeri mesaj (sabit Base Sepolia id'si)
      const message = `FlagWars Login
Address: ${w}
Nonce: ${nonce}
URI: ${location.origin}
Chain: ${BASE_SEPOLIA_ID}`

      // 3) SIGN
      let signature: `0x${string}`
      try {
        signature = await signMessageAsync({ message })
      } catch (e: any) {
        const m = e?.message || ''
        if (m.includes('User rejected') || m.includes('User denied')) {
          throw new Error('Signature cancelled by user')
        }
        throw new Error('Signature failed')
      }

      // 4) verify
      const v = await fetch('/api/auth/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: w, message, signature }),
      })
      if (!v.ok) {
        const e = await v.json().catch(() => ({}))
        throw new Error(e?.error || 'Login verification failed')
      }

      // başarılı → login durumunu güncelle
      setIsLoggedIn(true)
      setErr(null)
      
      // Check onboarding status first (GET), then POST only if needed
      try {
        // First check status
        const statusRes = await fetch('/api/user/status', {
          credentials: 'include'
        })
        
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          
          // If already completed, go to target (market)
          if (statusData.state === 'completed') {
            window.location.href = target
            return
          }
          
          // If pending/processing, go to creating
          if (statusData.state === 'pending' || statusData.state === 'processing') {
            window.location.href = '/creating'
            return
          }
        }
        
        // Status not found or unknown - try onboard POST
        const onboardRes = await fetch('/api/user/onboard', {
          method: 'POST',
          credentials: 'include'
        })
        
        if (onboardRes.ok) {
          const onboardData = await onboardRes.json()
          
          // If onboarding is pending/processing, redirect to /creating
          if (onboardData.state === 'pending' || onboardData.state === 'processing') {
            window.location.href = '/creating'
            return
          }
        }
      } catch (onboardError) {
        console.error('[ONBOARD] Error:', onboardError)
        // Continue to target URL if onboarding fails
      }
      
      // User already onboarded or onboarding failed - go to target
      window.location.href = target
    } catch (e: any) {
      const msg = e?.message || 'Login failed'
      // Kullanıcı iptalinde sessiz kal
      if (!/Signature cancelled by user/i.test(msg)) {
        setErr(msg)
      }
    } finally {
      setBusy(false)
      loginInFlight.current = false
    }
  }, [address, signMessageAsync, router, target])

  // Bağlantı koptuğunda state'i temizle
  useEffect(() => {
    if (!isConnected) {
      loginInFlight.current = false
      if (busy) setBusy(false)
    }
  }, [isConnected])

  function pickConnector(): Connector | undefined {
    const ready = (connectors ?? []).filter((c: any) => c?.ready !== false)
    const byId = (id: string) => ready.find(c => c.id === id)
    // Öncelik: metamask → hedefli injected → generic injected → kalanlar
    return (
      byId('io.metamask') ||
      byId('metaMask') ||
      byId('injected') ||
      ready[0] ||
      connectors?.[0]
    )
  }

  async function handleConnect() {
    if (busy) return
    setErr(null)
    setBusy(true)

    try {
      // ZATEN BAĞLIYSA
      if (isConnected && address) {
        await requireBaseSepolia().catch(() => {})
        const needsSign = await shouldSignNow(address)
        if (needsSign) {
          await performLogin(address as `0x${string}`)
        } else {
          setBusy(false)
        }
        return
      }

      // YENİ BAĞLANTI
      const connector = pickConnector()
      if (!connector) {
        // Son çare: injected varsa direkt EIP-1193 isteği dene
        // @ts-ignore
        if (typeof window !== 'undefined' && window.ethereum?.request) {
          try {
            // @ts-ignore
            await window.ethereum.request({ method: 'eth_requestAccounts' })
            // wagmi state'i güncellenir, sonraki tıklamada imza açılır
            setBusy(false)
          } catch {
            setErr('No wallet detected')
            setBusy(false)
          }
          return
        }
        setErr('No wallet detected')
        setBusy(false)
        return
      }

      const res = await (connectAsync ?? connect)({ connector })
      
      // freshAddr çıkarımını güçlendir: res.account.address || res.accounts[0].address || res.accounts[0]
      let freshAddr =
        (res as any)?.account?.address ??
        (res as any)?.accounts?.[0]?.address ??
        (res as any)?.accounts?.[0]

      // Çakışan uzantılar için 'providers' dizisinden MetaMask'ı seç
      if (!freshAddr && typeof window !== 'undefined') {
        // @ts-ignore
        const eth = window.ethereum
        // @ts-ignore
        const providers = eth?.providers
        // MetaMask flag'li sağlayıcıyı yakala
        // @ts-ignore
        const mm = Array.isArray(providers) ? providers.find(p => p && (p.isMetaMask || p._metamask)) : eth
        if (mm?.request) {
          try {
            const accs = await mm.request({ method: 'eth_requestAccounts' })
            freshAddr = accs?.[0]
          } catch {}
        }
      }

      // Hâlâ yoksa generic fallback
      if (!freshAddr) {
        await new Promise(r => setTimeout(r, 150)) // state sync için minicik bekle
        const maybeSel = (window as any)?.ethereum?.selectedAddress
        if (maybeSel) {
          freshAddr = maybeSel
        } else {
          try {
            const accs = await (window as any)?.ethereum?.request?.({ method: 'eth_accounts' })
            freshAddr = accs?.[0]
          } catch {}
        }
      }

      if (!freshAddr) {
        setErr('Wallet connected but no account. Please unlock your wallet and try again.')
        setBusy(false)
        return
      }

      await ensureCorrectChain().catch(() => {})
      
      // yeni bağlandı → taze adresi kullan, /api/me taze kontrol et
      const needsSign = await shouldSignNow(freshAddr as `0x${string}`)
      if (needsSign) {
        await performLogin(freshAddr as `0x${string}`)
      } else {
        setBusy(false)
      }
    } catch (error: any) {
      const m = error?.message || ''
      setErr(m.includes('User') ? 'Wallet connection cancelled' : 'Wallet connection failed')
      setBusy(false)
    }
  }

  async function handleLogout() {
    setErr(null)
    setBusy(true)
    try {
      // Logout API'sini çağır
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      
      // Wallet'ı disconnect et
      if (isConnected) {
        disconnect()
      }
      
      // Login durumunu güncelle + ana sayfaya yönlendir
      setIsLoggedIn(false)
      loginInFlight.current = false
      router.push('/')
      router.refresh()
    } catch (e: any) {
      setErr('Logout failed')
    } finally {
      setBusy(false)
    }
  }

  // Hydration error'unu önlemek için server-side'da sabit text göster
  if (!mounted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button disabled style={{ padding: '0.75rem 1.5rem', borderRadius: '0.75rem', backgroundColor: 'var(--bg-panel-soft)', color: 'var(--text-secondary)', border: '1px solid var(--stroke)', opacity: 0.5 }}>
          Loading...
        </button>
      </div>
    )
  }

  // Wallet kontrolü
  const list = (connectors ?? []).filter((c) => (c as any).ready !== false)
  const preferredIds = ['io.metamask', 'metaMask', 'injected', 'walletConnect', 'io.wagmi.walletConnect']
  const connector = list.find((c) => preferredIds.includes(c.id)) ?? connectors?.[0]
  const noWallet = !connector

  // Dinamik buton metni
  const buttonLabel = noWallet
    ? 'No wallet detected'
    : (isConnected
        ? (isLoggedIn ? (busy ? 'Logging out...' : 'Disconnect') : (busy ? 'Signing...' : 'Sign to Login'))
        : (busy ? 'Processing...' : 'Connect Wallet'))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <button
        className={isLoggedIn ? 'btn btn-secondary' : 'btn btn-primary'}
        disabled={busy || noWallet}
        onClick={isLoggedIn ? handleLogout : handleConnect}
        style={{ opacity: (busy || noWallet) ? 0.5 : 1 }}
      >
        {buttonLabel}
      </button>

      {!isLoggedIn && err && (
        <span style={{ color: '#ff4444', fontSize: '0.875rem' }}>{err}</span>
      )}
    </div>
  )
}
