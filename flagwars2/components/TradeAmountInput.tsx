"use client"
import { useState } from 'react'

export function TradeAmountInput({ value, onChange, min=1, max }: {
  value?: string
  onChange: (v: string) => void
  min?: number
  max?: number
}) {
  const [err, setErr] = useState<string>('')

  function toIntString(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, '')
    if (!cleaned) return ''
    const n = Math.max(min, Math.min(Number(cleaned), max ?? Number.MAX_SAFE_INTEGER))
    return String(n)
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        inputMode="numeric"
        type="text"
        step={1}
        pattern="\\d+"
        placeholder="Adet (ör. 1, 2, 3...)"
        value={value ?? ''}
        onChange={(e) => {
          const v = toIntString(e.target.value)
          onChange(v)
          setErr(v && !/^\d+$/.test(v) ? 'Sadece tam sayı adet girin' : '')
        }}
        className="input"
      />
      {err ? <small className="text-red-500">{err}</small> : null}
    </div>
  )
}


