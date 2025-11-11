import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get('wallet')

  if (!walletParam) {
    return NextResponse.json(
      {
        ok: true,
        awarded: 0,
        used: 0,
        remaining: 0,
        totalLimit: 2,
        delta: 0.0005,
      },
      { status: 200 }
    )
  }

  const wallet = walletParam.toLowerCase()

  try {
    const db = await getDb()
    const doc = await db.collection('free_attacks').findOne<{ awarded?: number; used?: number; totalLimit?: number; delta?: number }>({ wallet })

    const totalLimit = doc?.totalLimit ?? Number(process.env.MAX_FREE_ATTACKS_PER_USER || '2')
    const awarded = doc?.awarded ?? 0
    const used = doc?.used ?? 0
    const maxUsable = Math.min(awarded, totalLimit)
    const remaining = Math.max(0, maxUsable - used)

    return NextResponse.json(
      {
        ok: true,
        awarded,
        used,
        remaining,
        totalLimit,
        delta: doc?.delta ?? 0.0005,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[free-attack/my] error', err)
    return NextResponse.json(
      {
        ok: true,
        awarded: 0,
        used: 0,
        remaining: 0,
        totalLimit: 2,
        delta: 0.0005,
      },
      { status: 200 }
    )
  }
}
