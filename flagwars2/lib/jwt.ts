// lib/jwt.ts
// @server-only - JWT operations for server-side use only
// NEVER: Hardcode secrets, use different JWT libraries, ignore clock tolerance
// ALWAYS: Edge-compatible jose, HS256, proper expiration, clockTolerance for Windows/VM
import { SignJWT, jwtVerify, JWTPayload } from 'jose'
import { toChecksumAddress } from '@/lib/validate'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret'
const secret = new TextEncoder().encode(JWT_SECRET)
const ALG = 'HS256'

// Tek giriş: JWT oluştur
export async function createJwt(
  payload: Record<string, any>, // { sub, wallet, ... }
  expiresIn: string = '7d'
) {
  // ÖNEMLİ: sub & wallet mutlaka string olmalı
  const sub = typeof payload.sub === 'string' ? payload.sub : String(payload.sub ?? '')
  const wallet = String(payload.wallet ?? '').toLowerCase()

  return await new SignJWT({ ...payload, sub, wallet })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

// Tek giriş: JWT doğrula (clockTolerance ile)
export async function verifyJwt(
  token: string
): Promise<JWTPayload & { wallet?: string; sub?: string }> {
  // Saat sapmasına tolerans (Windows/VM dev ortamları için kritik)
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [ALG],
    clockTolerance: 60, // saniye
  })
  // normalize
  if (payload.wallet) payload.wallet = String(payload.wallet).toLowerCase()
  if (payload.sub) payload.sub = String(payload.sub)
  return payload as any
}

// Request'ten user address çek (cookie tabanlı JWT'den)
export async function getUserAddressFromJWT(req: Request): Promise<`0x${string}` | null> {
  try {
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/(?:^|;)\s*fw_session=([^;]+)/)
    if (!m) return null
    
    const payload = await verifyJwt(decodeURIComponent(m[1]))
    const wallet = payload.wallet || payload.sub
    if (!wallet || typeof wallet !== 'string') return null
    
    // Normalize to checksum format
    return toChecksumAddress(wallet)
  } catch {
    return null // INVALID_ADDRESS_* durumunda da null döndür → 401
  }
}