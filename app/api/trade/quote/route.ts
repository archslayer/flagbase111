import { NextRequest, NextResponse } from 'next/server'
import { coreRead } from '@/lib/core'
import { verifyJwt } from '@/lib/jwt'
import { readUsdcBalance, readUsdcAllowance } from '@/lib/erc20'
import { token18ToUsdc6 } from '@/lib/amount'
import { withIdempotency } from '@/idempotency/handler'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ADDRESS } from '@/lib/addresses'

export const dynamic = 'force-dynamic'

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)'
])

const ERC20_PERMIT_ABI = parseAbi([
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)'
])

// Check if token supports EIP-2612 permit
async function checkPermitSupport(tokenAddress: `0x${string}`): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org')
    })
    // Try to read nonces() - if it exists, token likely supports permit
    await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_PERMIT_ABI,
      functionName: 'nonces',
      args: ['0x0000000000000000000000000000000000000000' as `0x${string}`]
    })
    return true
  } catch {
    return false
  }
}

export async function quoteHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // JWT auth from cookie
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/fw_session=([^;]+)/)
    let userId = 'anon'
    if (m) {
      try {
        const payload = await verifyJwt(decodeURIComponent(m[1]))
        userId = String(payload.sub || payload.wallet || 'anon')
      } catch {}
    }
    
    if (userId === 'anon') {
      return NextResponse.json({ ok: false, error: 'UNAUTH' }, { status: 401 })
    }

    // Parse request body
    const { countryId, amountToken18, mode } = await req.json()
    
    if (!countryId || !amountToken18 || !mode) {
      return NextResponse.json({ ok: false, error: 'BAD_INPUT' }, { status: 400 })
    }

    const countryIdNum = Number(countryId)
    const amountBigInt = BigInt(amountToken18)

    // Get current country info for price
    const countryInfo = await coreRead.getCountryInfo(countryIdNum)
    if (!countryInfo.exists) {
      return NextResponse.json({ ok: false, error: 'COUNTRY_NOT_FOUND' }, { status: 400 })
    }

    // Calculate USDC total based on current price
    const price8 = BigInt(countryInfo.price)
    const usdcTotal = mode === 'buy' 
      ? token18ToUsdc6(amountBigInt, price8)
      : token18ToUsdc6(amountBigInt, price8)

    const userAddress = userId as `0x${string}`

    if (mode === 'buy') {
      // BUY: Check USDC balance and allowance
      const userUsdcBal = await readUsdcBalance(userAddress)
      const allowance = await readUsdcAllowance(userAddress)

      // Calculate slippage (2% default)
      const slippageBps = 200 // 2%
      const slippageMax = (usdcTotal * BigInt(10000 + slippageBps)) / 10000n

      const allowanceShortage = allowance < usdcTotal
      const needApproval = allowanceShortage

      return NextResponse.json({
        ok: true,
        price8: price8.toString(),
        usdcTotal: usdcTotal.toString(),
        slippageMax: slippageMax.toString(),
        userUsdcBal: userUsdcBal.toString(),
        needApproval,
        allowanceShortage,
        supportsPermit: false, // USDC permit not used in buy flow
        needsApproval: needApproval
      })
    } else {
      // SELL: Check token balance and allowance, check permit support
      const tokenAddress = countryInfo.token as `0x${string}`
      
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org')
      })
      
      // Get token balance and allowance
      const [tokenBalance, tokenAllowance] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress]
        }) as Promise<bigint>,
        publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [userAddress, CORE_ADDRESS as `0x${string}`]
        }) as Promise<bigint>
      ])

      // Check if token supports permit (default: false)
      const supportsPermit = await checkPermitSupport(tokenAddress)
      
      // Check if approval is needed
      const needsApproval = tokenAllowance < amountBigInt

      // Get user USDC balance (for display purposes)
      const userUsdcBal = await readUsdcBalance(userAddress)

      return NextResponse.json({
        ok: true,
        price8: price8.toString(),
        usdcTotal: usdcTotal.toString(),
        slippageMax: usdcTotal.toString(), // For sell, slippageMax = usdcTotal
        userUsdcBal: userUsdcBal.toString(),
        needApproval: needsApproval && !supportsPermit, // Only need approval if permit not supported
        allowanceShortage: needsApproval,
        supportsPermit,
        needsApproval,
        tokenBalance: tokenBalance.toString(),
        tokenAllowance: tokenAllowance.toString()
      })
    }

  } catch (e: any) {
    console.error('Quote error:', e)
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'QUOTE_FAILED' 
    }, { status: 500 })
  }
}

export const POST = withIdempotency(quoteHandler)
