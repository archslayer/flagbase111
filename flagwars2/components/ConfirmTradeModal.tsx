"use client"
import { useState, useEffect } from 'react'
import { formatUSDC } from '@/lib/core'
import { useChainId } from 'wagmi'
import { BASE_SEPOLIA_ID, BASE_SEPOLIA_NAME } from '@/lib/chains'
import { requireBaseSepolia } from '@/lib/chain-guard'

interface Quote {
  usdcTotal: bigint
  netUSDC6?: bigint      // BUY için net cost (without slippage)
  maxInUSDC6?: bigint    // BUY için max input amount (with slippage)
  userUsdcBal: bigint
  needApproval: boolean
  allowance?: bigint
  usdcAllowance?: bigint // USDC allowance
  amountToken?: string // Token miktarı (formatlanmış string, ör: "1000")
  countryName?: string // Ülke adı (ör: "Turkey")
}

interface ConfirmTradeModalProps {
  open: boolean
  mode: 'buy' | 'sell'
  quote?: Quote
  pending?: boolean
  onApprove: () => Promise<void>
  onConfirm: () => Promise<void>
  onClose: () => void
  error?: string
  statusMsg?: string
  txHashShort?: string
}

function ConfirmTradeModal({ 
  open, 
  mode, 
  quote, 
  pending, 
  onApprove, 
  onConfirm, 
  onClose, 
  error,
  statusMsg,
  txHashShort
}: ConfirmTradeModalProps) {
  const chainId = useChainId()
  const rightNet = chainId === BASE_SEPOLIA_ID

  const needsApproval = quote?.needApproval
  // BUY için maxInUSDC6 kullan, SELL için usdcTotal
  const required = mode === 'buy' 
    ? (quote?.maxInUSDC6 ?? quote?.usdcTotal ?? 0n)
    : (quote?.usdcTotal ?? 0n)
  // SELL modunda kullanıcının USDC'ye ihtiyacı yok (Core USDC veriyor)
  const notEnough = mode === 'buy' && !!quote && quote.userUsdcBal < required

  if (!open) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--stroke)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        maxWidth: '400px',
        width: '90%'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
          {mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
        </h3>
        
        {quote && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              display: 'grid', 
              gap: '0.5rem',
              padding: '1rem',
              backgroundColor: 'var(--bg-panel-soft)',
              borderRadius: '0.5rem',
              border: '1px solid var(--stroke)'
            }}>
              {mode === 'buy' && quote.amountToken && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--stroke)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>You will receive:</span>
                  <span style={{ fontWeight: '700', color: '#10b981' }}>{quote.amountToken} {quote.countryName || 'tokens'}</span>
                </div>
              )}
              {mode === 'sell' && quote.amountToken && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--stroke)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>You will sell:</span>
                  <span style={{ fontWeight: '700', color: '#f59e0b' }}>{quote.amountToken} {quote.countryName || 'tokens'}</span>
                </div>
              )}
              {mode === 'buy' && quote.netUSDC6 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>You will pay:</span>
                  <span style={{ fontWeight: '600' }}>{formatUSDC(quote.netUSDC6)} USDC</span>
                </div>
              )}
              {mode === 'sell' && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>You will receive:</span>
                  <span style={{ fontWeight: '600' }}>{formatUSDC(quote.usdcTotal)} USDC</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Your Balance:</span>
                <span>{formatUSDC(quote.userUsdcBal)} USDC</span>
              </div>
            </div>
            {/* Slippage ve deadline bilgisi */}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              Slippage guard: 2% • Deadline: 5m
            </div>
          </div>
        )}
        
        {needsApproval && !notEnough && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            color: '#92400e',
            fontSize: '0.875rem'
          }}>
            ℹ️ First-time approval required. This is a one-time permission for all trades.
          </div>
        )}
        
        {notEnough && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            color: '#dc2626',
            fontSize: '0.875rem'
          }}>
            ❌ Insufficient USDC balance
          </div>
        )}
        
        {!rightNet && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            color: '#b45309',
            fontSize: '0.875rem'
          }}>
            ⚠️ Wrong network. Please switch to {BASE_SEPOLIA_NAME}.
            <button
              onClick={async () => {
                try { 
                  await requireBaseSepolia()
                } catch {
                  // User rejected switch
                }
              }}
              style={{
                marginLeft: 8,
                padding: '0.5rem 0.75rem',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                backgroundColor: '#fbbf24',
                color: '#92400e',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Switch to {BASE_SEPOLIA_NAME}
            </button>
          </div>
        )}

        {error && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            color: '#dc2626',
            fontSize: '0.875rem'
          }}>
            ❌ {error}
          </div>
        )}

        {statusMsg && (
          <div style={{
            marginBottom: '0.75rem',
            padding: '0.6rem 0.75rem',
            background: 'var(--bg-panel-soft)',
            border: '1px solid var(--stroke)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}>
            {statusMsg} {txHashShort ? `• ${txHashShort}` : ''}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          {needsApproval && !notEnough ? (
            // Approval gerekiyorsa SADECE Approve butonu göster
            <button
              onClick={onApprove}
              disabled={pending || !rightNet}
              style={{
                padding: '0.75rem 1rem',
                background: '#f59e0b',
                color: '#0b0f13',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: (pending || !rightNet) ? 'not-allowed' : 'pointer',
                opacity: (pending || !rightNet) ? 0.6 : 1
              }}
            >
              {pending ? 'Approving...' : 'Approve USDC'}
            </button>
          ) : (
            // Approval gerekmiyorsa Buy/Sell butonu göster
            <button
              onClick={onConfirm}
              disabled={pending || notEnough || !rightNet}
              style={{
                padding: '0.75rem 1rem',
                background: mode === 'buy' ? '#10b981' : '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                cursor: (pending || notEnough || !rightNet) ? 'not-allowed' : 'pointer',
                opacity: (pending || notEnough || !rightNet) ? 0.6 : 1
              }}
            >
              {pending ? (mode === 'buy' ? 'Buying...' : 'Selling...') : (mode === 'buy' ? 'Buy' : 'Sell')}
            </button>
          )}
          
          <button
            onClick={onClose}
            disabled={pending}
            style={{
              padding: '0.75rem 1rem',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--stroke)',
              borderRadius: 8,
              fontWeight: 500,
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.6 : 1
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmTradeModal
