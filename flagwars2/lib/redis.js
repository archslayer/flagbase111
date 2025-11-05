// @server-only - Redis client for server-side use only
// Redis singleton client. Uses REDIS_URL or host/port credentials.

let client = null
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
      client = createClient({ url })
    } else {
      const host = process.env.REDIS_HOST
      const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined
      const username = process.env.REDIS_USERNAME
      const password = process.env.REDIS_PASSWORD
      client = createClient({ socket: { host, port }, username, password })
    }

    client.on('error', (err) => {
      console.error('Redis Client Error', err)
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

module.exports = { getRedis }
