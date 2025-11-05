import { createClient, RedisClientType } from 'redis'

let workerClient: RedisClientType | null = null
let connecting = false

// Exponential backoff with jitter (cap 30s)
function backoff(attempt: number) {
  const base = Math.min(30000, 1000 * Math.pow(2, attempt))
  const jitter = Math.floor(Math.random() * 500)
  return base + jitter
}

export async function getRedisWorker(): Promise<RedisClientType> {
  if (workerClient && workerClient.isOpen) return workerClient
  if (connecting) {
    // wait until current connect finishes
    await new Promise(res => setTimeout(res, 100))
    if (workerClient && workerClient.isOpen) return workerClient
  }

  connecting = true
  try {
    const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
    if (!useRedis) throw new Error('USE_REDIS=false')

    const url = process.env.REDIS_URL
    if (url) {
      workerClient = createClient({
        url,
        socket: {
          keepAlive: 1,
          noDelay: true,
          reconnectStrategy: (retries) => backoff(retries),
        },
      })
    } else {
      workerClient = createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined,
          keepAlive: 1,
          noDelay: true,
          reconnectStrategy: (retries) => backoff(retries),
        },
        username: process.env.REDIS_USERNAME,
        password: process.env.REDIS_PASSWORD,
      })
    }

    workerClient.on('error', (err) => {
      console.error('[REDIS:worker] error:', err?.message || err)
    })
    workerClient.on('end', () => {
      console.warn('[REDIS:worker] connection ended')
    })
    workerClient.on('reconnecting', () => {
      console.warn('[REDIS:worker] reconnecting...')
    })
    workerClient.on('ready', () => {
      console.log('[REDIS:worker] ready')
    })

    await workerClient.connect()
    return workerClient
  } finally {
    connecting = false
  }
}

export async function quitRedisWorker() {
  if (workerClient && workerClient.isOpen) {
    await workerClient.quit()
  }
}

