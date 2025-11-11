import { NextRequest, NextResponse } from 'next/server'
import { begin, load, commit, clear } from './store'
import { makeIdemKey } from './key'

function stripSensitiveHeaders (h: Headers) {
  const keep = new Set(['content-type', 'cache-control', 'x-idempotency-key', 'x-idempotency-status'])
  const out = new Headers()
  for (const [k, v] of h.entries()) {
    const low = k.toLowerCase()
    if (keep.has(low)) out.set(low, v)
  }
  out.set('cache-control', 'no-store')
  return out
}

export function withIdempotency (
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const key = await makeIdemKey(req)
    const cached = await load(key)

    if (cached?.status === 'SUCCEEDED') {
      return new NextResponse(cached.body, {
        status: cached.code,
        headers: {
          'content-type': cached.ctype,
          'x-idempotency-key': key,
          'x-idempotency-status': 'cached',
          'cache-control': 'no-store'
        }
      })
    }
    if (cached?.status === 'PENDING') {
      return NextResponse.json(
        { error: 'pending' },
        { status: 409, headers: { 'x-idempotency-key': key, 'retry-after': '5' } }
      )
    }

    const lock = await begin(key)
    if (!lock) {
      return NextResponse.json(
        { error: 'concurrent' },
        { status: 409, headers: { 'x-idempotency-key': key, 'retry-after': '2' } }
      )
    }

    try {
      const res = await handler(req)
      const safeHeaders = stripSensitiveHeaders(res.headers)
      const ctype = safeHeaders.get('content-type') || 'application/json'
      const bodyText = await res.clone().text()

      await commit(key, {
        status: 'SUCCEEDED',
        code: res.status,
        ctype,
        body: bodyText,
        ts: Date.now()
      })

      return new NextResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: safeHeaders
      })
    } catch (e: any) {
      // Do NOT persist FAILED; clear to allow immediate retry
      await clear(key)
      throw e
    }
  }
}


