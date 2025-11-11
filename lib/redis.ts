// Redis singleton client. Uses REDIS_URL or host/port credentials.

let client: any = null
let pub: any = null
let sub: any = null
let isConnecting = false

async function getRedis() {
  if (client) return client
  if (isConnecting) {
    // naive wait loop
    await new Promise(r => setTimeout(r, 50))
    return client
  }
  isConnecting = true
  try {
    const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
    if (!useRedis) return null

    const { createClient } = require('redis')

    const url = process.env.REDIS_URL
    if (url) {
      client = createClient({ 
        url,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.error('[REDIS] Max reconnection attempts reached')
              return false
            }
            return Math.min(retries * 100, 3000)
          }
        }
      })
    } else {
      const host = process.env.REDIS_HOST
      const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
      const username = process.env.REDIS_USERNAME
      const password = process.env.REDIS_PASSWORD
      client = createClient({ 
        socket: { 
          host, 
          port,
          connectTimeout: 5000,
          reconnectStrategy: false,
        }, 
        username, 
        password 
      })
    }

    client.on('error', (err: Error) => {
      console.error('Redis Client Error', err)
    })

    client.on('connect', () => {
      console.log('[REDIS] Connected')
    })

    client.on('ready', () => {
      console.log('[REDIS] Ready')
    })

    client.on('reconnecting', () => {
      console.log('[REDIS] Reconnecting...')
    })

    client.on('end', () => {
      console.log('[REDIS] Connection ended')
    })

    await client.connect()
    return client
  } catch (err) {
    console.error('Redis connect failed', err)
    return null
  } finally {
    isConnecting = false
  }
}

async function getRedisPub() {
  const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
  if (!useRedis) return null
  
  if (!pub) {
    const { createClient } = require('redis')
    
    const url = process.env.REDIS_URL
    if (url) {
      pub = createClient({ 
        url,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: false,
        }
      })
    } else {
      const host = process.env.REDIS_HOST
      const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
      const username = process.env.REDIS_USERNAME
      const password = process.env.REDIS_PASSWORD
      pub = createClient({ 
        socket: { 
          host, 
          port,
          connectTimeout: 5000,
          reconnectStrategy: false,
        }, 
        username, 
        password 
      })
    }
    
    await pub.connect()
  }
  return pub
}

async function getRedisSub() {
  const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
  if (!useRedis) return null
  
  if (!sub) {
    const { createClient } = require('redis')
    
    const url = process.env.REDIS_URL
    if (url) {
      sub = createClient({ 
        url,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: false,
        }
      })
    } else {
      const host = process.env.REDIS_HOST
      const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
      const username = process.env.REDIS_USERNAME
      const password = process.env.REDIS_PASSWORD
      sub = createClient({ 
        socket: { 
          host, 
          port,
          connectTimeout: 5000,
          reconnectStrategy: false,
        }, 
        username, 
        password 
      })
    }
    
    await sub.connect()
  }
  return sub
}

export { getRedis, getRedisPub, getRedisSub }

// Legacy export - backward compatibility for old code
// Old code uses: import { redisClient } from '@/lib/redis'
// This proxy forwards method calls to the async getRedis() client
let legacyRedis: any = null
getRedis().then((c) => { legacyRedis = c }).catch(() => {})

// Proxy object that forwards calls to the async client
export const redisClient = new Proxy({} as any, {
  get(target, prop) {
    // If client is already connected, use it directly
    if (legacyRedis && legacyRedis[prop]) {
      const value = legacyRedis[prop]
      // If it's a function, bind it to the client
      if (typeof value === 'function') {
        return value.bind(legacyRedis)
      }
      return value
    }
    // If not connected yet, return async wrapper functions
    if (typeof prop === 'string') {
      const asyncMethods = ['get', 'set', 'del', 'setex', 'setEx', 'incr', 'expire', 'scan', 'unlink', 'keys', 'exists']
      if (asyncMethods.includes(prop)) {
        return async (...args: any[]) => {
          const client = await getRedis()
          if (!client) return null
          const method = (client as any)[prop]
          if (typeof method === 'function') {
            return method.apply(client, args)
          }
          return undefined
        }
      }
    }
    return undefined
  }
})

