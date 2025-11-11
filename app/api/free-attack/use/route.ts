import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

const MAX_FREE = Number(process.env.MAX_FREE_ATTACKS_PER_USER || 2)
const DEFAULT_DELTA = 0.0005

let indexEnsured = false

async function ensureIndex(db: Awaited<ReturnType<typeof getDb>>) {
  if (indexEnsured) return
  try {
    await db.collection('free_attacks').createIndex(
      { wallet: 1 },
      { unique: true, name: 'uniq_wallet_free_attacks' }
    )
  } catch (err: any) {
    if (err?.codeName !== 'IndexOptionsConflict' && err?.code !== 85) {
      console.error('[free-attack/use] ensureIndex error:', err)
    }
  } finally {
    indexEnsured = true
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const walletInput = body.wallet as string | undefined
    const source = body.source as string | undefined

    if (!walletInput) {
      return NextResponse.json(
        { ok: false, error: 'wallet_required' },
        { status: 400 }
      )
    }

    const wallet = walletInput.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/i.test(wallet)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_wallet' },
        { status: 400 }
      )
    }

    const db = await getDb()
    await ensureIndex(db)
    const collection = db.collection('free_attacks')
    const now = new Date()

    // Try to increment existing record atomically
    let granted = false
    let record = await collection.findOneAndUpdate(
      { wallet, used: { $lt: MAX_FREE } },
      {
        $inc: { used: 1 },
        $set: { updatedAt: now },
        ...(source
          ? { $push: { history: { source, at: now } } }
          : {}),
      },
      { returnDocument: 'after' }
    )

    if (record.value) {
      granted = true
    } else {
      try {
        const insertDoc: any = {
          wallet,
          used: 1,
          createdAt: now,
          updatedAt: now,
        }
        if (source) {
          insertDoc.history = [{ source, at: now }]
        }
        await collection.insertOne(insertDoc)
        record = { value: insertDoc }
        granted = true
      } catch (err: any) {
        if (err?.code === 11000) {
          // Document already exists, try one more time to increment
          const retry = await collection.findOneAndUpdate(
            { wallet, used: { $lt: MAX_FREE } },
            {
              $inc: { used: 1 },
              $set: { updatedAt: now },
              ...(source
                ? { $push: { history: { source, at: now } } }
                : {}),
            },
            { returnDocument: 'after' }
          )
          if (retry.value) {
            record = retry
            granted = true
          } else {
            const existing = await collection.findOne({ wallet })
            record = { value: existing ?? null }
            granted = false
          }
        } else {
          throw err
        }
      }
    }

    const used = record.value?.used ?? 0
    const remaining = Math.max(0, MAX_FREE - used)

    if (!granted) {
      return NextResponse.json({
        ok: true,
        granted: false,
        reason: 'max_reached',
        used,
        remaining,
        totalLimit: MAX_FREE,
        delta: DEFAULT_DELTA,
      })
    }

    return NextResponse.json({
      ok: true,
      granted: true,
      used,
      remaining,
      totalLimit: MAX_FREE,
      delta: DEFAULT_DELTA,
    })
  } catch (error) {
    console.error('[free-attack/use]', error)
    return NextResponse.json(
      { ok: false, error: 'internal_error' },
      { status: 500 }
    )
  }
}
