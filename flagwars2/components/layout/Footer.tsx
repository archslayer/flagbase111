'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{
      marginTop: 'auto',
      padding: '2rem',
      borderTop: '1px solid var(--stroke)',
      background: 'var(--bg-panel-soft)',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          © 2025 FlagWars. All rights reserved.
        </div>
        
        <div style={{
          display: 'flex',
          gap: '2rem',
          fontSize: '0.875rem',
        }}>
          <Link 
            href="/terms" 
            style={{ 
              color: 'var(--text-muted)', 
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            Terms of Service
          </Link>
          
          <Link 
            href="/privacy" 
            style={{ 
              color: 'var(--text-muted)', 
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}

