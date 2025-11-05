// app/api/me/route.ts
// NEVER: Return sensitive data, hardcode user fields
// ALWAYS: JWT verification, safe user data return
import { NextResponse } from 'next/server'
import { verifyJwt } from '@/lib/jwt'
import { getDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { setDebugHeader } from '@/lib/debugHeaders'

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get('cookie') || ''
    
    const cookie = cookieHeader
      .split(';')
      .map(s => s.trim())
      .find(c => c.startsWith('fw_session='))?.split('=')[1]

    if (!cookie) return NextResponse.json({ error: 'no token' }, { status: 401 })

    const payload = await verifyJwt(cookie)
    const db = await getDb()
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(String(payload.sub)) },
      { projection: { _id: 1, wallet: 1, createdAt: 1 } }
    )
    if (!user) return NextResponse.json({ error: 'user not found' }, { status: 401 })

    const res = NextResponse.json({ ok: true, wallet: user.wallet })
    setDebugHeader(res, 'x-auth-me', 'ok')
    return res
  } catch (e) {
    const res = NextResponse.json({ error: 'jwt fail' }, { status: 401 })
    return res
  }
}