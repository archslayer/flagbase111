"use client"
import { useEffect } from "react"
import Image from "next/image"

interface VictorySplashProps {
  show: boolean
  onClose: () => void
}

export function VictorySplash({ show, onClose }: VictorySplashProps) {
  useEffect(() => {
    if (show) {
      // Prevent body scroll when splash is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [show])

  if (!show) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        cursor: 'pointer',
        animation: 'fadeIn 0.3s ease-in-out'
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '80%',
          maxWidth: '600px',
          animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        <Image
          src="/victory.png"
          alt="Victory!"
          width={600}
          height={400}
          priority
          style={{
            width: '100%',
            height: 'auto',
            filter: 'drop-shadow(0 0 30px rgba(255, 215, 0, 0.8))'
          }}
        />
        
        <div style={{
          position: 'absolute',
          bottom: '-50px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.875rem',
          textAlign: 'center',
          animation: 'pulse 2s infinite'
        }}>
          Click anywhere to continue
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

