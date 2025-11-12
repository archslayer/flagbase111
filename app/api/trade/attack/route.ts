import { NextRequest, NextResponse } from 'next/server'
import { enqueueAttackJob } from '@/lib/attackQueue'
import { withIdempotency } from '@/idempotency/handler'
import { assertWholeTokens } from '@/lib/validate'

export const POST = withIdempotency(async (req: NextRequest) => {
  const { user, fromId, toId } = await req.json()
  if (!user || !fromId || !toId) return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 })
  
  // Generate a simple idempotency key for the attack job (no amountToken18 anymore)
  const key = `attack:${String(user).toLowerCase()}:${Number(fromId)}:${Number(toId)}`
  await enqueueAttackJob({ user, fromId: Number(fromId), toId: Number(toId), idempotencyKey: key })
  return NextResponse.json({ queued: true, key })
})


