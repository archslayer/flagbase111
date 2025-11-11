import { NextRequest, NextResponse } from 'next/server'
import { processAttackEvent } from '@/lib/processAttackEvent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { txHash, user, feeUSDC6 } = body

    if (!txHash || !user) {
      return NextResponse.json(
        { ok: false, error: 'missing_params' },
        { status: 200 }
      )
    }

    const result = await processAttackEvent({
      wallet: user,
      txHash,
      feeUSDC6: Number(feeUSDC6 ?? 0)
    })

    return NextResponse.json({ ok: true, result }, { status: 200 })
  } catch (err: any) {
    console.error('[attacks/verify] error', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'internal_error' },
      { status: 200 }
    )
  }
}

