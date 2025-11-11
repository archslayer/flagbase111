import { NextRequest, NextResponse } from 'next/server'
import { enqueueAttackJob } from '@/lib/attackQueue'
import { withIdempotency } from '@/idempotency/handler'
import { assertWholeTokens } from '@/lib/validate'

export const POST = withIdempotency(async (req: NextRequest) => {
  const { user, fromId, toId, amountToken18 } = await req.json()
  if (!user || !fromId || !toId || !amountToken18) return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 })
  try { assertWholeTokens(BigInt(amountToken18)) } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'ONLY_INTEGER_TOKENS' }, { status: 400 })
  }
  
  // Generate a simple idempotency key for the attack job
  const key = `attack:${String(user).toLowerCase()}:${Number(fromId)}:${Number(toId)}:${BigInt(amountToken18)}`
  await enqueueAttackJob({ user, fromId: Number(fromId), toId: Number(toId), amountToken18: BigInt(amountToken18), idempotencyKey: key })
  return NextResponse.json({ queued: true, key })
})


