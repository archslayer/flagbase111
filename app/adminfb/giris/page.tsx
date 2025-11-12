'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ADMIN_PASSWORD = '123789Fw.'

export default function AdminGirisPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setError(null)

    if (!password) {
      setError('Lütfen parola girin')
      return
    }

    if (password !== ADMIN_PASSWORD) {
      setError('Geçersiz parola')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/adminfb/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (data.ok) {
        router.push('/adminfb')
      } else {
        setError(data.error || 'Giriş başarısız')
      }
    } catch (err: any) {
      setError(err.message || 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0a0a0a',
      padding: '2rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '2rem',
      }}>
        <h1 style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}>
          Admin Giriş
        </h1>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            color: '#ccc',
            fontSize: '0.875rem',
            marginBottom: '0.5rem',
          }}>
            Parola:
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleLogin()
              }
            }}
            placeholder="Parola girin"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '1rem',
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: '0.75rem',
            background: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            color: '#ff6b6b',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading || !password}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: loading || !password ? '#333' : '#ffd700',
            color: loading || !password ? '#666' : '#000',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: loading || !password ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </div>
    </div>
  )
}

