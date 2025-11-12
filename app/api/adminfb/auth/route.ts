// app/api/adminfb/auth/route.ts
// Admin authentication endpoint
// Requires: password + wallet address (must be admin wallet)

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminPassword } from '@/lib/adminAuth'
import { createJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * POST /api/adminfb/auth
 * Admin login with password + wallet verification
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { password } = body

    if (!password) {
      return NextResponse.json(
        { ok: false, error: 'Parola gerekli' },
        { status: 400 }
      )
    }

    // Verify password
    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz parola' },
        { status: 401 }
      )
    }

    // Create admin session JWT (7 days expiry)
    const token = await createJwt(
      {
        sub: 'admin',
        admin: true,
      },
      '7d'
    )

    const response = NextResponse.json({
      ok: true,
      message: 'Giriş başarılı',
    })

    // Set admin session cookie
    response.cookies.set('fw_admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[AdminAuth] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Giriş başarısız' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/adminfb/auth
 * Admin logout
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: 'Çıkış yapıldı' })
  response.cookies.set('fw_admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}

