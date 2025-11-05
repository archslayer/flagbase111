// app/api/quests/check-discord/route.ts
import 'server-only'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { inspectGuildMember } from '@/lib/discord'
import { getAddress } from 'viem'

export async function POST(req: Request) {
  try {
    // Feature flag check
    if (process.env.FEATURE_QUESTS !== 'true') {
      return NextResponse.json(
        { ok: false, error: 'feature-disabled' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { userId, discordId } = body
    const guildId = process.env.DISCORD_GUILD_ID || ''
    const roleId = process.env.FLAG_OWNER_ROLE_ID || ''

    if (!userId || !discordId) {
      return NextResponse.json({ ok: false, error: 'missing_params' }, { status: 400 })
    }

    if (!guildId || !roleId) {
      return NextResponse.json({ ok: false, error: 'missing_guild_or_role' }, { status: 500 })
    }

    // Normalize userId to checksummed format, keep discordId as string
    let normalizedUserId: string
    try {
      normalizedUserId = getAddress(userId)
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_userId' }, { status: 400 })
    }

    // Discord member and role inspection
    const inspect = await inspectGuildMember(String(discordId), guildId)
    const member = inspect.member
    const hasRole = member && inspect.roleIds.includes(roleId)

    // Check flag ownership (DB)
    const db = await getDb()
    const progress = await db.collection('achv_progress').findOne(
      { userId: normalizedUserId },
      { projection: { flagCount: 1 } }
    )
    const hasFlag = !!progress && (progress.flagCount ?? 0) > 0

    // ok is true only if all three conditions are met
    const ok = member && hasRole && hasFlag

    return NextResponse.json({
      ok,
      member,
      hasRole,
      hasFlag,
      message: ok
        ? 'All requirements met'
        : !member
          ? 'User is not a guild member'
          : !hasRole
            ? 'Required role not found'
            : 'No flag ownership'
    })
  } catch (err: any) {
    console.error('[Quest] Check Discord exception:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'server_error' },
      { status: 500 }
    )
  }
}
