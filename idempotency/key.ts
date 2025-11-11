import { createHash } from 'crypto'
import { cookies } from 'next/headers'
import { verifyJwt } from '@/lib/jwt'

export async function deriveUserId (req: Request) {
  try {
    const c = cookies()
    const token = c.get('fw_session')?.value
    if (token) {
      const payload = await verifyJwt(token)
      const id = String(payload.sub || payload.wallet || 'anon').toLowerCase()
      if (id && id !== 'anon') return id
    }
  } catch {}
  const u = req.headers.get('x-user-id') || 'anon'
  return u.toLowerCase()
}

export async function bodyHash (req: Request) {
  const ct = req.headers.get('content-type') || ''
  // Only hash small textual bodies; cap at 128 KB
  const isHashable = /(json|text|x-www-form-urlencoded)/i.test(ct)
  if (!isHashable) return 'no-body'
  try {
    const MAX = 128 * 1024
    const buf = await req.clone().arrayBuffer()
    const view = new Uint8Array(buf, 0, Math.min((buf as any).byteLength ?? 0, MAX))
    return createHash('sha256').update(view).digest('hex').slice(0, 32)
  } catch {
    return 'no-body'
  }
}

export async function makeIdemKey (req: Request) {
  const u = await deriveUserId(req)
  const m = req.method.toUpperCase()
  const url = new URL(req.url)
  const p = url.pathname
  const bh = await bodyHash(req)
  return `idem:${u}:${m}:${p}:${bh}`
}


