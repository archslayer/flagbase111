// app/api/adminfb/verify/route.ts
// Verify admin session

import { NextRequest, NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/adminfb/verify
 * Verify admin session
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('fw_admin_session')?.value

    if (!token) {
      return NextResponse.json(
        { ok: false, authenticated: false, error: 'No session' },
        { status: 401 }
      )
    }

    const payload = await verifyJwt(token)

    // Verify admin flag
    if (!payload.admin) {
      return NextResponse.json(
        { ok: false, authenticated: false, error: 'Invalid session' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      ok: true,
      authenticated: true,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, authenticated: false, error: 'Session verification failed' },
      { status: 401 }
    )
  }
}

