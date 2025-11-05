import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress, createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { getDb } from '@/lib/mongodb'
import { ACHV_COLLECTIONS, type AchievementMint } from '@/lib/schemas/achievements'
import { markAsMinted } from '@/lib/achievements'
import { redisClient } from '@/lib/redis'

export const runtime = 'nodejs'

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
})

/**
 * POST /api/achievements/confirm
 * 
 * Confirm a successful mint transaction on-chain and update DB.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const userWallet = await getUserAddressFromJWT(req)
    if (!userWallet) {
      return NextResponse.json(
        { ok: false, error: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const userId = getAddress(userWallet)

    // 2. Parse request
    const body = await req.json()
    const { txHash, category, level } = body

    if (
      !txHash ||
      typeof txHash !== 'string' ||
      typeof category !== 'number' ||
      typeof level !== 'number'
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT' },
        { status: 400 }
      )
    }

    // 3. Get transaction receipt
    let receipt: any
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      })
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: 'TX_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { ok: false, error: 'TX_FAILED' },
        { status: 422 }
      )
    }

    // 4. Extract tokenId from AchievementMinted event
    // Event signature: AchievementMinted(address indexed user, uint256 indexed category, uint256 indexed level, uint256 tokenId, uint256 timestamp)
    const eventTopic = '0x' + require('crypto')
      .createHash('sha256')
      .update('AchievementMinted(address,uint256,uint256,uint256,uint256)')
      .digest('hex')
      .substring(0, 64)

    // Find the event in logs
    const mintLog = receipt.logs.find((log: any) => {
      // Check if user matches (first indexed param)
      const userFromLog = '0x' + log.topics[1]?.slice(26) // Remove padding
      return userFromLog.toLowerCase() === userId.toLowerCase()
    })

    if (!mintLog) {
      return NextResponse.json(
        { ok: false, error: 'EVENT_NOT_FOUND' },
        { status: 404 }
      )
    }

    // Extract tokenId from event data (4th param, non-indexed)
    // Data contains: tokenId (32 bytes) + timestamp (32 bytes)
    const data = mintLog.data as string
    
    // Debug: log raw data
    console.log('[CONFIRM] Raw event data:', data)
    console.log('[CONFIRM] Data length:', data.length)
    
    // Parse correctly: data is "0x" + hex, skip 0x, take first 64 chars for tokenId
    const tokenIdHex = '0x' + data.slice(2, 66) // Skip 0x (2 chars), take next 64 chars
    const tokenId = BigInt(tokenIdHex).toString()
    
    console.log('[CONFIRM] Parsed tokenId:', tokenId)

    // 5. Save to DB
    const db = await getDb()
    const mintsCollection = db.collection<AchievementMint>(ACHV_COLLECTIONS.MINTS)

    // Check if already confirmed (idempotent)
    const existing = await mintsCollection.findOne({
      userId,
      category,
      level,
      status: 'confirmed',
    })

    if (existing) {
      return NextResponse.json({
        ok: true,
        message: 'ALREADY_CONFIRMED',
        tokenId: existing.tokenId,
      })
    }

    // Insert mint record
    const mintRecord: AchievementMint = {
      userId,
      category,
      level,
      tokenId,
      txHash,
      mintedAt: new Date(),
      priceUSDC6: '200000',
      status: 'confirmed',
      confirmedAt: new Date(),
    }

    await mintsCollection.insertOne(mintRecord)

    // 6. Update achv_progress.minted
    await markAsMinted(userId, category, level)

    // 7. Clear cache
    if (redisClient) {
      const cacheKey = `achv:mint:auth:${userId}:${category}:${level}`
      await redisClient.del(cacheKey)
    }

    // 8. Return success
    return NextResponse.json({
      ok: true,
      tokenId,
      message: 'Achievement minted successfully!',
    })
  } catch (error: any) {
    console.error('[API /achievements/confirm] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

