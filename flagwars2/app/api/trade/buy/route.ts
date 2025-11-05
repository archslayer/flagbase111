import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getBuyQuote, assertFresh } from '@/lib/quotes'
import { CORE_ABI, makeWallet, writeWithTimeout, setTxStatus, setTxOwner } from '@/lib/tx'
import { guardUserInFlight } from '@/lib/nonces'
import { verifyJwt, getUserAddressFromJWT } from '@/lib/jwt'
import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http } from 'viem'
import { acquireUserInflight, checkRateLimit } from '@/lib/rate-limit'
import { MAX_INFLIGHT_PER_USER } from '@/lib/cfg'
import { withIdempotency } from '@/idempotency/handler'
import { translateContractError } from '@/lib/error-handler'
import { assertWholeTokens, toChecksumAddress } from '@/lib/validate'
import { readUsdcBalance, readUsdcAllowance } from '@/lib/erc20'
import { v4 as uuid } from 'uuid'
import { baseSepolia } from 'viem/chains'
import { incrementTxStatus } from '@/lib/telemetry'
import { enqueueAnalyticsEvent } from '@/lib/analytics-enqueue'

// Schema validation
const BodySchema = z.object({
  countryId: z.number().int().min(0),
  amountToken18: z.union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative()
  ]),
  minOut: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  deadline: z.number().int().positive().optional()
}).strict()

function assertCoreAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_CORE_ADDRESS
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error('CONFIG: Missing/invalid NEXT_PUBLIC_CORE_ADDRESS')
  }
  return addr as `0x${string}`
}

function toBigIntSafe(v: string | number): bigint {
  if (typeof v === 'number') return BigInt(v)
  return BigInt(v)
}

async function quoteHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // JWT auth from cookie
    const user = await getUserAddressFromJWT(req)
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTH' }, { status: 401 })
    }

    // Optional: Check x-wallet header for mismatch
    const xWallet = req.headers.get('x-wallet')
    if (xWallet) {
      try {
        const connected = toChecksumAddress(xWallet)
        if (connected !== user) {
          return NextResponse.json({ ok: false, code: 'WALLET_MISMATCH' }, { status: 409 })
        }
      } catch {
        // Invalid header format - ignore or return BAD_WALLET
        return NextResponse.json({ ok: false, code: 'BAD_WALLET' }, { status: 400 })
      }
    }

    // Parse request body
    const { countryId, amountToken18 } = await req.json()
    
    if (!countryId || !amountToken18) {
      return NextResponse.json({ ok: false, error: 'BAD_INPUT' }, { status: 400 })
    }

    const countryIdNum = Number(countryId)
    const amountBigInt = toBigIntSafe(amountToken18)
    
    try { assertWholeTokens(amountBigInt) } catch (e:any) {
      return NextResponse.json({ ok: false, error: e?.message || 'ONLY_INTEGER_TOKENS' }, { status: 400 })
    }

    // Get quote
    const quote = await getBuyQuote(countryIdNum, amountBigInt)
    
    // Get user USDC balance and allowance
    const userUsdcBal = await readUsdcBalance(user)
    const allowance = await readUsdcAllowance(user)

    const allowanceShortage = allowance < quote.minOut
    const needApproval = allowanceShortage

    return NextResponse.json({
      ok: true,
      price8: quote.price8.toString(),
      usdcTotal: quote.minOut.toString(),
      slippageMax: quote.minOut.toString(), // Same as minOut for now
      userUsdcBal: userUsdcBal.toString(),
      needApproval,
      allowanceShortage
    })

  } catch (e: any) {
    console.error('Quote error:', e)
    
    // Map errors to user-friendly responses
    const code = e?.name === 'SyntaxError' ? 'BAD_JSON' : 'QUOTE_FAILED'
    const status = code === 'BAD_JSON' ? 400 : 500
    
    return NextResponse.json({ 
      ok: false, 
      code,
      message: e?.message || 'QUOTE_FAILED' 
    }, { status })
  }
}

async function buyHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // JWT auth from cookie
    const user = await getUserAddressFromJWT(req)
    if (!user) {
      return NextResponse.json({ ok: false, code: 'UNAUTH' }, { status: 401 })
    }
    
    // Optional: Check x-wallet header for mismatch
    const xWallet = req.headers.get('x-wallet')
    if (xWallet) {
      try {
        const connected = toChecksumAddress(xWallet)
        if (connected !== user) {
          return NextResponse.json({ ok: false, code: 'WALLET_MISMATCH' }, { status: 409 })
        }
      } catch {
        // Invalid header format - ignore or return BAD_WALLET
        return NextResponse.json({ ok: false, code: 'BAD_WALLET' }, { status: 400 })
      }
    }
  
  // Generate transaction ID and set owner
  const txId = uuid()
  setTxOwner(txId, user)
  
  // Extract userId for rate limiting
  const userId = user.toLowerCase()
  
  // Rate limiting: 10 req/min for trade endpoints
  const rateLimit = await checkRateLimit(`trade:${userId}`, 10, 60)
  if (!rateLimit.ok) {
    return NextResponse.json({ 
      ok: false, 
      error: 'RATE_LIMIT_EXCEEDED',
      remaining: rateLimit.remaining,
      resetTime: rateLimit.resetTime
    }, { status: 429 })
  }
  
  // Body parse & validate
  let parsed
  try {
    const body = await req.json()
    parsed = BodySchema.parse(body)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 })
  }
  
  const countryId = Number(parsed.countryId)
  const amountToken18 = toBigIntSafe(parsed.amountToken18)
  try { assertWholeTokens(amountToken18) } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'ONLY_INTEGER_TOKENS' }, { status: 400 })
  }
  
  // UI'dan gelen minOut ve deadline parametreleri
  const uiMinOut = parsed.minOut ? toBigIntSafe(parsed.minOut) : undefined
  const uiDeadline = parsed.deadline ? BigInt(parsed.deadline) : undefined

  // Set initial status as PENDING
  await setTxStatus(txId, 'PENDING')

  // Concurrency guard (Redis if available)
  const rl = await acquireUserInflight(`user:${userId}`, MAX_INFLIGHT_PER_USER, 60)
  if (!rl.ok) return NextResponse.json({ ok: false, error: 'USER_MAX_INFLIGHT' }, { status: 429 })
  const release = () => { rl.release() }
  try {
    const core = assertCoreAddress()
    
    // For custodial model - server wallet from ENV
    const serverPk = process.env.SERVER_SIGNER_PK as `0x${string}`
    if (!serverPk) {
      return NextResponse.json({ ok: false, error: 'SERVER_SIGNER_PK missing' }, { status: 500 })
    }
    const account = privateKeyToAccount(serverPk)
    const wc = makeWallet(account)

    // Quote + freshness check
    const quote = await getBuyQuote(countryId, amountToken18)
    assertFresh(quote)

    // UI'dan gelen parametreleri kullan, yoksa fallback
    const maxCost = uiMinOut ?? quote.minOut
    const deadline = uiDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 600)

    // Preflight simulation to catch revert reasons
    try {
      await publicClient.simulateContract({
        address: core,
        abi: CORE_ABI,
        functionName: 'buy',
        args: [BigInt(countryId), amountToken18, maxCost, deadline],
        account: account.address
      })
    } catch (simError: any) {
      console.error('Buy simulation failed:', simError)
      throw new Error(`Preflight check failed: ${simError.message}`)
    }

    // Write with slippage protection
    const hash = await writeWithTimeout(
      wc.writeContract({
        address: core,
        abi: CORE_ABI,
        functionName: 'buy',
        args: [BigInt(countryId), amountToken18, maxCost, deadline],
      })
    )

    // Wait for transaction receipt and publish CONFIRMED/FAILED
    queueMicrotask(async () => {
      try {
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA)
        })
        
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const status = receipt.status === 'success' ? 'CONFIRMED' : 'FAILED'
        await setTxStatus(txId, status)
        
        // Telemetri: Transaction status sayacı
        queueMicrotask(() => incrementTxStatus(status, 'buy'))
        
        // Emit price update for CONFIRMED transactions
        if (status === 'CONFIRMED') {
          const { emitPriceForTx } = require('@/lib/tx')
          await emitPriceForTx(txId, { countryId })
          
          // Enqueue analytics event (non-blocking)
          // TODO: Extract actual logIndex from receipt.logs for better idempotency
          enqueueAnalyticsEvent({
            type: 'buy',
            chainId: 84532,
            txHash: hash,
            logIndex: 0, // FIXME: Should be actual logIndex from receipt.logs
            blockNumber: Number(receipt.blockNumber || 0),
            timestamp: Math.floor(Date.now() / 1000),
            wallet: user.toLowerCase(), // Normalize to lowercase
            countryId,
            amountToken18: amountToken18.toString(),
            quoteIn: quote.maxInUSDC6.toString(),
            netFeeBps: quote.netFeeBps
          }).catch(e => console.error('[BUY] Analytics enqueue failed:', e))
        }
      } catch (err) {
        console.log('Transaction receipt failed:', err)
        await setTxStatus(txId, 'FAILED')
        queueMicrotask(() => incrementTxStatus('FAILED', 'buy'))
      }
    })
    
    return NextResponse.json({ ok: true, hash, txId }, { status: 200 })
  } catch (err: any) {
    // Map contract errors
    const userMsg = translateContractError(err)
    const status = /insufficient|nonce|rejected|timeout/i.test(userMsg) ? 400 : 500
    
    // Set status to FAILED
    await setTxStatus(txId, 'FAILED')
    
    // Telemetri: Failed transaction
    queueMicrotask(() => incrementTxStatus('FAILED', 'buy'))
    
    return NextResponse.json({ ok: false, code: 'BUY_FAILED', error: userMsg, txId }, { status })
  } finally {
    release()
  }
  } catch (e: any) {
    // Outer catch for general errors
    return NextResponse.json({ 
      ok: false, 
      code: 'INTERNAL',
      message: e?.message || 'BUY_FAILED' 
    }, { status: 500 })
  }
}

// Handle different endpoints
export async function POST(req: NextRequest) {
  // Chain validation (optional)
  const chain = Number(req.headers.get('x-chain-id') || 0)
  if (chain && chain !== 84532) {
    return NextResponse.json({ ok: false, code: 'WRONG_NETWORK' }, { status: 409 })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  
  if (action === 'quote') {
    return quoteHandler(req)
  }
  
  // Buy işleminde server yazmayı sonlandır:
  // UI artık doğrudan sözleşmeye yazacak
  return NextResponse.json(
    { ok: false, code: 'CLIENT_MUST_CALL_CONTRACT' },
    { status: 400 }
  )
}
