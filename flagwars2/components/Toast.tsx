"use client"
import { createContext, useContext, useState, useCallback } from 'react'

type ToastItem = { id: string, type: 'success' | 'error' | 'info', text: string, ttl?: number }
const ToastCtx = createContext<{ push: (t: Omit<ToastItem, 'id'>) => void }>({ push: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    // Use timestamp + random to ensure unique keys
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setItems((prev) => [...prev, { id, ...t }])
    setTimeout(() => setItems((prev) => prev.filter(x => x.id !== id)), t.ttl ?? 3000)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div style={{ position: 'fixed', right: 16, bottom: 16, display: 'grid', gap: 8, zIndex: 9999 }}>
        {items.map(i => (
          <div key={i.id} style={{
            padding: '10px 12px',
            borderRadius: 10,
            color: '#0b0f13',
            background: i.type === 'success' ? '#34d399' : i.type === 'error' ? '#fecaca' : '#93c5fd',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
            maxWidth: 360
          }}>{i.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() { return useContext(ToastCtx) }

