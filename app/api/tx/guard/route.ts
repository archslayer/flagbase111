import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'

import { checkRateLimit } from '@/lib/rate-limit'
import { acquireTxGuards, releaseTxGuards, markTxGuardsSent } from '@/lib/tx-idempotency'
import { getUserAddressFromJWT } from '@/lib/jwt'

const RATE_LIMIT_LIMIT = 10
const RATE_LIMIT_WINDOW = 60 // seconds

type GuardRequestBody = {
  wallet?: string
  mode?: 'buy' | 'sell'
  countryId?: number | string
  amountWei?: string
  status?: 'sent'
  lockKey?: string
}

function jsonResponse(data: Record<string, any>, status = 200) {
  return NextResponse.json(data, { status })
}

async function readBody(req: NextRequest): Promise<GuardRequestBody | null> {
  try {
    const body = (await req.json()) as GuardRequestBody
    if (body && typeof body === 'object') {
      return body
    }
    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const body = await readBody(req)
  if (!body) {
    return jsonResponse({ ok: false, reason: 'INVALID_BODY' }, 400)
  }

  let walletFromAuth: string | null = null
  try {
    walletFromAuth = await getUserAddressFromJWT(req)
  } catch {
    walletFromAuth = null
  }

  const walletInput = body.wallet ?? walletFromAuth ?? undefined
  if (!walletInput) {
    return jsonResponse({ ok: false, reason: 'WALLET_REQUIRED' }, 400)
  }

  let normalizedWallet: string
  try {
    normalizedWallet = getAddress(walletInput).toLowerCase()
  } catch {
    return jsonResponse({ ok: false, reason: 'INVALID_WALLET' }, 400)
  }

  if (walletFromAuth) {
    try {
      const authNormalized = getAddress(walletFromAuth).toLowerCase()
      if (authNormalized !== normalizedWallet) {
        return jsonResponse({ ok: false, reason: 'WALLET_MISMATCH' }, 403)
      }
    } catch {
      // ignore auth mismatch if parsing fails
    }
  }

  const { mode, amountWei } = body
  const countryId = Number(body.countryId)

  if (mode !== 'buy' && mode !== 'sell') {
    return jsonResponse({ ok: false, reason: 'INVALID_MODE' }, 400)
  }

  if (!Number.isFinite(countryId) || countryId <= 0) {
    return jsonResponse({ ok: false, reason: 'INVALID_COUNTRY' }, 400)
  }

  if (!amountWei) {
    return jsonResponse({ ok: false, reason: 'INVALID_AMOUNT' }, 400)
  }

  let amountBigInt: bigint
  try {
    amountBigInt = BigInt(amountWei)
  } catch {
    return jsonResponse({ ok: false, reason: 'INVALID_AMOUNT' }, 400)
  }

  if (amountBigInt <= 0n) {
    return jsonResponse({ ok: false, reason: 'INVALID_AMOUNT' }, 400)
  }

  // Rate limit (per wallet)
  const rateLimitKey = `tx:rate:${normalizedWallet}`
  const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMIT_LIMIT, RATE_LIMIT_WINDOW)
  if (!rateLimit.ok) {
    const waitMs = Math.max(0, rateLimit.resetTime - Date.now())
    const waitSec = Math.max(1, Math.ceil(waitMs / 1000))
    return jsonResponse({ ok: false, reason: 'RATE_LIMIT', waitSec }, 429)
  }

  const guardResult = await acquireTxGuards({
    wallet: normalizedWallet,
    mode,
    countryId,
    amountWei: amountBigInt,
  })

  if (!guardResult.ok) {
    return jsonResponse({ ok: false, reason: guardResult.reason }, 409)
  }

  return jsonResponse({ ok: true, lockKey: guardResult.lockKey })
}

export async function PATCH(req: NextRequest) {
  const body = await readBody(req)
  if (!body || !body.lockKey) {
    return jsonResponse({ ok: false, reason: 'INVALID_BODY' }, 400)
  }

  if (body.status !== 'sent') {
    return jsonResponse({ ok: false, reason: 'INVALID_STATUS' }, 400)
  }

  try {
    await markTxGuardsSent(body.lockKey)
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('[tx/guard] Failed to mark lock as sent:', error)
    return jsonResponse({ ok: false, reason: 'INTERNAL_ERROR' }, 500)
  }
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req)
  if (!body || !body.lockKey) {
    return jsonResponse({ ok: false, reason: 'INVALID_BODY' }, 400)
  }

  try {
    await releaseTxGuards(body.lockKey)
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('[tx/guard] Failed to release lock:', error)
    return jsonResponse({ ok: false, reason: 'INTERNAL_ERROR' }, 500)
  }
}