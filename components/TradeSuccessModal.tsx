"use client"
import { useEffect } from 'react'

interface TradeSuccessModalProps {
  show: boolean
  onClose: () => void
  type: 'buy' | 'sell'
  amount: string
  countryName: string
}

export function TradeSuccessModal({ show, onClose, type, amount, countryName }: TradeSuccessModalProps) {
  // Close on ESC key
  useEffect(() => {
    if (!show) return
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [show, onClose])

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.3s ease-in-out'
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '2px solid rgba(255, 215, 0, 0.3)',
          borderRadius: '1.5rem',
          padding: '3rem 2rem',
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(255, 215, 0, 0.3)',
          animation: 'slideUp 0.4s ease-out',
          cursor: 'pointer'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success Icon */}
        <div
          style={{
            width: '100px',
            height: '100px',
            margin: '0 auto 1.5rem',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'scaleIn 0.5s ease-out',
            boxShadow: '0 10px 30px rgba(52, 211, 153, 0.4)'
          }}
        >
          <svg
            width="50"
            height="50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Title */}
        <h2
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '0.5rem',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
          }}
        >
          {type === 'buy' ? '✅ Purchase Successful!' : '✅ Sale Successful!'}
        </h2>

        {/* Message */}
        <p
          style={{
            fontSize: '1.2rem',
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '2rem',
            lineHeight: '1.6'
          }}
        >
          You {type === 'buy' ? 'purchased' : 'sold'}{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {amount}
          </span>{' '}
          {countryName} {type === 'buy' ? 'tokens' : ''}
        </p>

        {/* Close Hint */}
        <p
          style={{
            fontSize: '0.875rem',
            color: 'rgba(255, 255, 255, 0.5)',
            marginTop: '2rem'
          }}
        >
          Click anywhere or press ESC to close
        </p>
      </div>
    </div>
  )
}
