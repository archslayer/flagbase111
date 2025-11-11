// middleware.ts
// NEVER: Scan all routes, hardcode domains, ignore JWT errors
// ALWAYS: Explicit matcher, proper redirects, cookie cleanup, unified JWT helper
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret'
const secret = new TextEncoder().encode(JWT_SECRET)

const PROTECTED_PREFIXES = ['/profile', '/achievements', '/quests', '/invite', '/attack']

async function verifyJwt(token: string) {
  await jwtVerify(token, secret, { clockTolerance: 60 })
}

/**
 * Handle referral code capture
 * If ?ref=CODE is present, call /api/referral/resolve and set cookie
 */
async function handleReferralCode(req: NextRequest): Promise<NextResponse | null> {
  const { searchParams, origin, pathname } = req.nextUrl
  const refCode = searchParams.get('ref')
  
  if (!refCode) return null
  
  try {
    // Call resolve API
    const resolveUrl = new URL('/api/referral/resolve', origin)
    resolveUrl.searchParams.set('code', refCode)
    
    const response = await fetch(resolveUrl.toString(), {
      headers: {
        'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
        'x-real-ip': req.headers.get('x-real-ip') || '',
        'user-agent': req.headers.get('user-agent') || ''
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      
      if (data.ok && data.refWallet) {
        // Set referral cookie (will be encrypted in the API)
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown'
        const userAgent = req.headers.get('user-agent') || ''
        
        // Create payload inline (simplified version)
        const payload = {
          code: refCode,
          refWallet: data.refWallet,
          ts: Date.now(),
          ipHash: 'temp', // Will be properly hashed by encodeRefCookie
          exp: Date.now() + 7 * 24 * 60 * 60 * 1000
        }
        
        // Encode cookie (import helper dynamically to avoid edge runtime issues)
        // For now, we'll set a simple cookie and let the API handle encryption
        const cookieValue = Buffer.from(JSON.stringify({
          code: refCode,
          refWallet: data.refWallet,
          ts: Date.now()
        })).toString('base64')
        
        // Redirect to clean URL
        const cleanUrl = new URL(pathname, origin)
        const res = NextResponse.redirect(cleanUrl)
        
        res.cookies.set('fw_ref_temp', cookieValue, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/'
        })
        
        return res
      }
    }
  } catch (error) {
    console.error('[Middleware] Referral code handling error:', error)
  }
  
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Handle referral code capture (before auth check)
  const refResponse = await handleReferralCode(req)
  if (refResponse) return refResponse
  
  // Auth check for protected routes
  const needsAuth = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (!needsAuth) return NextResponse.next()

  const token = req.cookies.get('fw_session')?.value
  if (!token) {
    const url = new URL('/', req.url)
    url.searchParams.set('r', pathname)
    return NextResponse.redirect(url)
  }

  try {
    await verifyJwt(token)
    return NextResponse.next()
  } catch {
    const url = new URL('/', req.url)
    url.searchParams.set('r', pathname)
    const res = NextResponse.redirect(url)
    res.cookies.set('fw_session', '', { path: '/', maxAge: 0 })
    return res
  }
}

export const config = {
  matcher: [
    '/profile/:path*',
    '/achievements/:path*',
    '/quests/:path*',
    '/invite/:path*',
    '/attack/:path*',
  ],
}
