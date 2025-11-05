// app/api/auth/logout/route.ts
// NEVER: Hardcode cookie names, forget to clear cookies
// ALWAYS: Clear fw_session cookie, proper path settings
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('fw_session', '', { path: '/', maxAge: 0 })
  return res
}