// app/api/quests/claim/route.ts
import 'server-only'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getGuildMemberRoles } from '@/lib/discord'
import { getAddress } from 'viem'
import { getRedis } from '@/lib/redis'

export async function POST(req: Request) {
  try {
    // Feature flag check
    if (process.env.FEATURE_QUESTS !== 'true') {
      return NextResponse.json(
        { ok: false, error: 'feature-disabled' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { wallet, discordId } = body

    if (!wallet || !discordId) {
      return NextResponse.json(
        { ok: false, error: 'missing_params' },
        { status: 400 }
      )
    }

    const userId = getAddress(wallet)
    const questKey = 'COMMUNICATION_SPECIALIST'
    const maxFreeAttacks = Number(process.env.MAX_FREE_ATTACKS_PER_USER || '2')

    const db = await getDb()

    // Idempotency lock
    const redis = await getRedis()
    const lockKey = `quest:lock:${userId}:${questKey}`
    
    if (redis) {
      const lock = await redis.setNX(lockKey, '1')
      if (!lock) {
        return NextResponse.json(
          { ok: false, error: 'already-processing' },
          { status: 429 }
        )
      }
      await redis.expire(lockKey, 30)
    }

    try {
      // Check freeAttacksClaimed limit
      const progress = await db.collection('achv_progress').findOne({ userId })
      const currentClaimed = progress?.freeAttacksClaimed || 0

      if (currentClaimed >= maxFreeAttacks) {
        return NextResponse.json(
          { ok: false, error: 'limit-reached' },
          { status: 403 }
        )
      }

      // Re-verify Discord roles
      const guildId = process.env.DISCORD_GUILD_ID
      const requiredRoleId = process.env.FLAG_OWNER_ROLE_ID

      if (!guildId || !requiredRoleId) {
        throw new Error('discord_config_missing')
      }

      const roles = await getGuildMemberRoles(discordId, guildId)
      if (!roles || !roles.includes(requiredRoleId)) {
        return NextResponse.json(
          { ok: false, error: 'requirements_not_met' },
          { status: 403 }
        )
      }

      // Check flag count
      const flagCount = (progress?.flagCount || 0)
      if (flagCount < 1) {
        return NextResponse.json(
          { ok: false, error: 'insufficient_flags' },
          { status: 403 }
        )
      }

      // Check if already claimed (userId check)
      const existingByUserId = await db.collection('quest_claims').findOne({
        userId,
        questKey
      })
      if (existingByUserId) {
        return NextResponse.json(
          { ok: false, error: 'quest-already-claimed' },
          { status: 409 }
        )
      }

      // Check if already claimed (discordId check - prevent spam)
      const existingByDiscordId = await db.collection('quest_claims').findOne({
        discordId,
        questKey
      })
      if (existingByDiscordId) {
        return NextResponse.json(
          { ok: false, error: 'quest-already-claimed' },
          { status: 409 }
        )
      }

      const now = new Date()

      // Insert quest claim
      await db.collection('quest_claims').insertOne({
        userId,
        discordId,
        questKey,
        claimedAt: now,
        source: 'discord'
      })

      // Update achv_progress with proper upsert logic
      if (!progress) {
        // First time user
        await db.collection('achv_progress').insertOne({
          userId,
          totalAttacks: 0,
          distinctCountriesAttacked: 0,
          referralCount: 0,
          flagCount: 0,
          freeAttacksClaimed: 1,
          earned: {},
          minted: {},
          createdAt: now,
          updatedAt: now
        })
      } else {
        // Existing user
        await db.collection('achv_progress').updateOne(
          { userId },
          {
            $inc: { freeAttacksClaimed: 1 },
            $set: { updatedAt: now }
          }
        )
      }

      // Insert free_attacks record
      await db.collection('free_attacks').insertOne({
        userId,
        fromQuest: questKey,
        available: 1,
        createdAt: now
      })

      // Clear cache
      if (redis) {
        await redis.del(`achv:my:${userId}`)
        await redis.del(`quest:status:${userId}`)
      }

      console.log(`[Quest] Claimed: ${questKey} by ${userId}`)

      return NextResponse.json({
        ok: true,
        claimed: true,
        freeGiven: 1
      })
    } finally {
      // Release lock
      if (redis) {
        await redis.del(lockKey)
      }
    }
  } catch (err: any) {
    console.error('[Quest] Claim exception:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'server_error' },
      { status: 500 }
    )
  }
}
