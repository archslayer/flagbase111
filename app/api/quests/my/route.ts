import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const walletParam = req.nextUrl.searchParams.get('wallet')

  if (!walletParam) {
    return NextResponse.json(
      {
        ok: true,
        quests: [],
        progress: {},
      },
      { status: 200 }
    )
  }

  const wallet = walletParam.toLowerCase()

  try {
    const db = await getDb()
    const [claims, progressDocs] = await Promise.all([
      db.collection('quest_claims').find({ wallet }).toArray(),
      db.collection('quest_progress').find({ wallet }).toArray(),
    ])

    const quests = claims
      .map(doc => doc.questKey ?? doc.questId)
      .filter(Boolean)

    const progress: Record<string, any> = {}
    for (const doc of progressDocs) {
      if (!doc?.questKey) continue
      const steps = Array.isArray(doc.steps) ? doc.steps : []
      progress[doc.questKey] = {
        follow: steps.includes('follow'),
        tweet: steps.includes('tweet'),
        steps,
        completedAt: doc.completedAt ?? null,
      }
    }

    return NextResponse.json(
      {
        ok: true,
        quests,
        progress,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error('[quests/my] error', err)
    return NextResponse.json(
      {
        ok: true,
        quests: [],
        progress: {},
      },
      { status: 200 }
    )
  }
}
