// IORedis client for BullMQ (server-only)
import 'server-only'
import IORedis from 'ioredis'

let ioredisInstance: IORedis | null = null

export function getIORedisConfig(): IORedis | null {
  const useQueue = (process.env.USE_QUEUE ?? 'false').toLowerCase() === 'true'
  if (!useQueue) return null

  if (ioredisInstance) return ioredisInstance

  const url = process.env.REDIS_URL
  if (url) {
    ioredisInstance = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    })
    console.log('[IOREDIS] ✅ Connected via URL')
    return ioredisInstance
  }

  const host = process.env.REDIS_HOST
  const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379
  const username = process.env.REDIS_USERNAME
  const password = process.env.REDIS_PASSWORD

  ioredisInstance = new IORedis({
    host,
    port,
    username,
    password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  })

  console.log(`[IOREDIS] ✅ Connected to ${host}:${port}`)
  return ioredisInstance
}
