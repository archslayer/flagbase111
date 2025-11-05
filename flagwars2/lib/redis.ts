// Redis singleton client. Uses REDIS_URL or host/port credentials (server-only).
import 'server-only'
import type { RedisClientType } from 'redis'

const g = globalThis as unknown as {
  __rw?: { 
    client?: RedisClientType
    pub?: RedisClientType
    sub?: RedisClientType
    connecting?: Promise<RedisClientType|null> 
  }
}
g.__rw ||= {}

async function connect(kind: 'client'|'pub'|'sub'): Promise<RedisClientType | null> {
  const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
  if (!useRedis) return null
  if (g.__rw?.[kind]) return g.__rw[kind] as RedisClientType
  if (g.__rw?.connecting) return g.__rw.connecting

  g.__rw.connecting = (async () => {
    const { createClient } = require('redis')
    const url = process.env.REDIS_URL
    const base = url
      ? createClient({ url, socket: { connectTimeout: 5000 } })
      : createClient({
          socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined,
            connectTimeout: 5000
          },
          username: process.env.REDIS_USERNAME,
          password: process.env.REDIS_PASSWORD
        })
    base.on('error', (e: any) => console.error(`[REDIS:${kind}]`, e?.message || e))
    await base.connect()
    console.log(`[REDIS:${kind}] ✅ Connected`)
    return base
  })()

  const c = await g.__rw.connecting
  if (c) {
    g.__rw[kind] = c as RedisClientType
  }
  g.__rw.connecting = undefined
  return c as RedisClientType | null
}

export async function getRedis()   { return connect('client') }
export async function getRedisPub(){ return connect('pub') }
export async function getRedisSub(){ return connect('sub') }

// Alias for compatibility with activity module
export async function redisClient() { return connect('client') }
