import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get('wallet')

  if (!walletParam) {
    return NextResponse.json(
      {
        ok: false,
        error: 'wallet query is required, e.g. /api/quests/debug?wallet=0x1234',
      },
      { status: 200 }
    )
  }

  const wallet = walletParam.toLowerCase()

  try {
    const db = await getDb()

    const questClaims = await db
      .collection('quest_claims')
      .find({ wallet })
      .toArray()

    const freeAttacks = await db
      .collection('free_attacks')
      .findOne({ wallet })

    const achvProgress = await db
      .collection('achv_progress')
      .findOne({ wallet })

    return NextResponse.json(
      {
        ok: true,
        wallet,
        questClaims,
        freeAttacks,
        achvProgress,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[quests/debug] error', err)
    return NextResponse.json(
      {
        ok: false,
        error: String(err),
      },
      { status: 200 }
    )
  }
}


