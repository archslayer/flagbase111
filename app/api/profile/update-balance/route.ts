import { NextRequest, NextResponse } from 'next/server'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { getAddress, parseUnits } from 'viem'
import { getDb } from '@/lib/mongodb'
import { COLLECTIONS, type UserBalance } from '@/lib/schemas/user-balances'
import { getRedis } from '@/lib/redis'
import { updateFlagCount } from '@/lib/achievements'
import type { FlagSnapshot } from '@/lib/schemas/flags-snapshots'

export const runtime = 'nodejs'

/**
 * POST /api/profile/update-balance
 * 
 * Update user balance in DB after successful buy/sell transaction.
 * Called from market page after transaction confirmation.
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
    const { countryId, amount, direction, txHash } = body

    if (
      typeof countryId !== 'number' ||
      typeof amount !== 'string' ||
      typeof direction !== 'number' ||
      (direction !== 1 && direction !== -1) ||
      !txHash
    ) {
      return NextResponse.json(
        { ok: false, error: 'INVALID_INPUT' },
        { status: 400 }
      )
    }

    // 3. Convert amount to token18 format
    const amountToken18 = parseUnits(amount, 18).toString()
    const amountInt = parseFloat(amount)

    // 4. Update DB
    const db = await getDb()
    const collection = db.collection<UserBalance>(COLLECTIONS.USER_BALANCES)

    // Get current balance
    const current = await collection.findOne({ userId, countryId })
    const currentAmountToken18 = current?.amountToken18 || '0'
    const currentAmount = current?.amount || 0

    // Calculate new balance
    const newAmountToken18 = BigInt(currentAmountToken18) + (direction === 1 ? BigInt(amountToken18) : -BigInt(amountToken18))
    const newAmount = currentAmount + (direction === 1 ? amountInt : -amountInt)
    
    console.log(`[UPDATE_BALANCE] ${userId} country ${countryId}: ${currentAmount} ${direction === 1 ? '+' : '-'} ${amountInt} = ${newAmount}`)

    // If balance is zero or negative, delete the record
    if (newAmount <= 0 || newAmountToken18 <= 0n) {
      await collection.deleteOne({ userId, countryId })
      
      // Clear inventory cache
      const redisClient = await getRedis()
      if (redisClient) {
        await redisClient.del(`inv:${userId}`)
      }
      
      return NextResponse.json({
        ok: true,
        message: 'Balance cleared (user owns zero tokens)',
        txHash
      })
    }

    // Update or insert balance
    await collection.updateOne(
      { userId, countryId },
      {
        $set: {
          amountToken18: newAmountToken18.toString(),
          amount: newAmount,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )

    // Clear inventory cache
    const redisClient = await getRedis()
    if (redisClient) {
      await redisClient.del(`inv:${userId}`)
    }

    // 6. Update flag count for achievements (count distinct countries with balance > 0)
    try {
      const allBalances = await collection.find({ userId, amount: { $gt: 0 } }).toArray()
      const ownedCount = allBalances.length

      // Take snapshot and update achievement progress
      await db.collection<FlagSnapshot>('flags_snapshots').insertOne({
        userId,
        ownedCount,
        ts: new Date(),
      })

      // Update achievement flag count
      await updateFlagCount(userId, ownedCount)

      // Clear achievements cache
      if (redisClient) {
        await redisClient.del(`achv:my:${userId}`).catch(() => {})
      }
    } catch (flagError) {
      console.error('[UPDATE_BALANCE] Flag count update error:', flagError)
      // Don't fail the request if flag count update fails
    }

    // 5. Return success
    return NextResponse.json({
      ok: true,
      message: 'Balance updated',
      newAmount,
      txHash
    })
  } catch (error: any) {
    console.error('[API /profile/update-balance] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

