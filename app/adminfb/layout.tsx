// app/adminfb/layout.tsx
// Admin panel layout with sidebar and topbar

'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAccount } from 'wagmi'
import { getAddress } from 'viem'
import { 
  LayoutDashboard, 
  Users, 
  DollarSign, 
  TrendingUp, 
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const ADMIN_WALLET = '0xc32e33f743cf7f95d90d1392771632ff1640de16'

interface AdminLayoutProps {
  children: React.ReactNode
}

const menuItems = [
  { href: '/adminfb', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/adminfb/users', label: 'Users', icon: Users },
  { href: '/adminfb/market', label: 'Market Prices', icon: TrendingUp },
  { href: '/adminfb/referrals', label: 'Referrals', icon: Users },
  { href: '/adminfb/revenue', label: 'Revenue', icon: DollarSign },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { address } = useAccount()
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    // Don't check auth for login page
    if (pathname === '/adminfb/giris') {
      setChecking(false)
      return
    }

    // Check admin session
    fetch('/api/adminfb/verify')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.authenticated) {
          setAuthenticated(true)
        } else {
          router.push('/adminfb/giris')
        }
        setChecking(false)
      })
      .catch(() => {
        router.push('/adminfb/giris')
        setChecking(false)
      })
  }, [router, pathname])

  const handleLogout = async () => {
    await fetch('/api/adminfb/auth', { method: 'DELETE' })
    router.push('/adminfb/giris')
  }

  // Don't apply admin layout to login page
  if (pathname === '/adminfb/giris') {
    return <>{children}</>
  }

  if (checking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      }}>
        <div style={{ color: 'var(--text-primary)' }}>Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  const isAdminWallet = address && getAddress(address).toLowerCase() === ADMIN_WALLET.toLowerCase()

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
    }}>
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? '256px' : '0',
          minHeight: '100vh',
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--stroke)',
          transition: 'width 0.3s',
          overflow: 'hidden',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 100,
        }}
        className="admin-sidebar"
      >
        <div style={{ padding: '1.5rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2rem',
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: 'var(--gold)',
            }}>
              Admin Panel
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              <X size={20} />
            </button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    background: isActive ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
                    color: isActive ? 'var(--gold)' : 'var(--text-secondary)',
                    textDecoration: 'none',
                    border: isActive ? '1px solid var(--gold)' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--bg-panel-soft)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </a>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{
        flex: 1,
        marginLeft: sidebarOpen ? '256px' : '0',
        transition: 'margin-left 0.3s',
      }}>
        {/* Topbar */}
        <header style={{
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--stroke)',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '0.5rem',
            }}
          >
            <Menu size={24} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {address && (
              <div style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
              }}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
            >
              <LogOut size={16} style={{ marginRight: '0.5rem' }} />
              Logout
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main style={{
          padding: '2rem',
          maxWidth: '1400px',
          margin: '0 auto',
        }}>
          {children}
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 99,
            display: 'none',
          }}
        />
      )}
    </div>
  )
}
