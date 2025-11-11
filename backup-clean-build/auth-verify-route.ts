// AUTH VERIFY ACTIVE VERSION
// app/api/auth/verify/route.ts
// NEVER: Hardcode domains, swallow errors, log secrets, leave dev bypass in prod
// ALWAYS: SIWE-lite verification, proper cookie settings, error handling, rate limiting
console.log('AUTH_VERIFY_ROUTE_LOADED')
import { NextRequest, NextResponse } from 'next/server'
import { createJwt } from '@/lib/jwt'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { setDebugHeader } from '@/lib/debugHeaders'
import { rateLimit } from '@/lib/rl'
import { toChecksumAddress } from '@/lib/validate'

const ALLOW_DEV_SIGNATURE = process.env.ALLOW_DEV_SIGNATURE === 'true'

export async function POST(req: NextRequest) {
  try {
    // Rate limiting - IP'yi sadece header'dan al
    const ip =
      req.headers.get('x-forwarded-for') ??
      req.headers.get('x-real-ip') ??
      'unknown'
    if (!rateLimit(`verify:${ip}`, 10, 60000)) {
      return NextResponse.json({ error: 'rate limited' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const { wallet, message, signature } = body || {}

    if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 })
    
    // Normalize wallet to checksum format
    const w = toChecksumAddress(wallet)

    // SIWE doğrulaması
    if (process.env.NODE_ENV === 'production') {
      // prod: SIWE zorunlu
      if (!signature || !message) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
      }
      // TODO: gerçek SIWE verify
    } else {
      // dev: bypass sadece flag açık ve signature === 'dev' ise
      if (ALLOW_DEV_SIGNATURE && signature === 'dev') {
        // Dev bypass allowed - skip signature verification
      } else {
        // Normal signature verification required
        if (!signature || !message) {
          return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
        }
        // Basic signature format validation (should be hex)
        if (!signature.startsWith('0x') || signature.length < 10) {
          return NextResponse.json({ error: 'invalid signature format' }, { status: 400 })
        }
        // TODO: istersen burada da gerçek SIWE verify ekleyebilirsin
      }
    }

    const db = await getDb()
    // users: { _id:ObjectId, wallet:"0x...", createdAt, tokenVersion:0, ... }
    // unique index: { wallet: 1 }
    const now = new Date()
    
    // Check if this is a new user (before upsert)
    const existingUser = await db.collection('users').findOne({ wallet: w })
    const isNewUser = !existingUser
    
    // İlk upsert ile user'ı oluştur (eğer yoksa)
    await db.collection('users').updateOne(
      { wallet: w },
      {
        $setOnInsert: {
          wallet: w,
          createdAt: now,
          tokenVersion: 0,
          referralCode: null,
          stats: { logins: 0 },
        },
      },
      { upsert: true }
    )
    
    // If new user, check for referral cookie and create referral intent
    if (isNewUser) {
      const refCookie = req.cookies.get('fw_ref_temp')?.value
      if (refCookie) {
        try {
          // Decode referral cookie (simple base64)
          const decoded = Buffer.from(refCookie, 'base64').toString('utf-8')
          const payload = JSON.parse(decoded) as { code: string; refWallet: string; ts: number }
          
          if (payload.code && payload.refWallet) {
            // Check expiry (7 days)
            const age = Date.now() - payload.ts
            if (age < 7 * 24 * 60 * 60 * 1000) {
              const { resolveReferralCode, isSelfReferral } = await import('@/lib/referral')
              const { normalizeCode, normalizeWallet } = await import('@/lib/schemas/referral-validation')
              const { COLLECTIONS } = await import('@/lib/schemas/referral')
              
              const sanitizedCode = normalizeCode(payload.code)
              const resolved = await resolveReferralCode(sanitizedCode)
              
              if (resolved) {
                const { getAddress } = await import('viem')
                const inviterWallet = getAddress(resolved.wallet)
                const inviterLower = normalizeWallet(inviterWallet)
                const walletLower = normalizeWallet(w)
                
                // Self-referral check
                if (!isSelfReferral(w, inviterWallet)) {
                  // Idempotent upsert referral intent
                  await db.collection('referrals').updateOne(
                    { walletLower },
                    {
                      $setOnInsert: {
                        userId: w,
                        wallet: w,
                        walletLower,
                        refWallet: inviterWallet,
                        refWalletLower: inviterLower,
                        refCode: sanitizedCode,
                        confirmedOnChain: false,
                        createdAt: now,
                        totalBuys: 0,
                        totalSells: 0,
                        isActive: false
                      }
                    },
                    { upsert: true }
                  )
                  
                  console.log(`[AUTH] Referral intent created for ${w} by ${inviterWallet} (code: ${sanitizedCode})`)
                }
              }
            }
          }
        } catch (err) {
          console.error('[AUTH] Referral cookie processing failed:', err)
          // Don't fail auth if referral processing fails
        }
      }
    }
    
    // Sonra login count'u artır ve lastLoginAt güncelle
    await db.collection('users').updateOne(
      { wallet: w },
      {
        $set: { lastLoginAt: now },
        $inc: { 'stats.logins': 1 },
      }
    )

    const user = await db.collection('users').findOne({ wallet: w }, { projection: { _id: 1, wallet: 1, tokenVersion: 1 } })
    if (!user) return NextResponse.json({ error: 'user not found after upsert' }, { status: 500 })

    const token = await createJwt(
      { sub: String(user._id), wallet: user.wallet, tokenVersion: user.tokenVersion ?? 0 },
      '7d'
    )

    const res = NextResponse.json({ ok: true })
    // dev'de secure:false, prod'da true olmalı
    res.cookies.set('fw_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    
    // Clear referral cookie after successful auth (if it exists)
    if (req.cookies.get('fw_ref_temp')) {
      res.cookies.set('fw_ref_temp', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      })
    }

    // sadece dev'de debug header
    setDebugHeader(res, 'x-auth-set-cookie', '1')
    return res
  } catch (e: any) {
    console.error('verify error:', e?.message || e)
    return NextResponse.json({ error: 'Auth failed' }, { status: 400 })
  }
}
