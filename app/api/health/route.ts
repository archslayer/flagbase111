import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getRedis } from '@/lib/redis'

export const runtime = 'nodejs'

export async function GET() {
  const startedAt = Date.now()
  const info: any = {
    ok: true,
    version: process.env.NEXT_PUBLIC_COMMIT_SHA || 'dev',
    env: process.env.NODE_ENV,
    checks: {
      mongo: 'unknown',
      redis: 'unknown',
    }
  }

  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    info.checks.mongo = 'ok'
  } catch (e: any) {
    info.ok = false
    info.checks.mongo = `fail:${e?.message || 'err'}`
  }

  try {
    const redis = await getRedis()
    if (redis) {
      await redis.ping()
      info.checks.redis = 'ok'
    } else {
      info.checks.redis = 'disabled'
    }
  } catch (e: any) {
    info.ok = false
    info.checks.redis = `fail:${e?.message || 'err'}`
  }

  info.latencyMs = Date.now() - startedAt
  return NextResponse.json(info, { status: info.ok ? 200 : 503 })
}
