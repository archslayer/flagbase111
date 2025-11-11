// DEV fallback uses memory, PROD should use Redis (SETNX + TTL) for multi-instance safety.

const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'

let memory = new Map()
const TTL_SEC = 24 * 60 * 60
const MAX_BODY = 64 * 1024

let redis = null
if (useRedis) {
  // Use central redis singleton
  const { getRedis } = require('../lib/redis')
  getRedis().then((c) => { redis = c }).catch(() => {})
}

async function begin(key) {
  if (redis) {
    const ok = await redis.set(key, JSON.stringify({ status: 'PENDING', ts: Date.now() }), { NX: true, EX: TTL_SEC })
    return ok === 'OK'
  }
  if (memory.has(key)) return false
  memory.set(key, { status: 'PENDING', code: 102, ctype: 'text/plain', body: 'PENDING', ts: Date.now() })
  return true
}

async function load(key) {
  if (redis) {
    const raw = await redis.get(key)
    return raw ? JSON.parse(raw) : null
  }
  return memory.get(key) ?? null
}

async function commit(key, res) {
  const clipped = res.body.length > MAX_BODY ? res.body.slice(0, MAX_BODY) : res.body
  const out = { ...res, body: clipped }
  if (redis) {
    await redis.set(key, JSON.stringify(out), { EX: TTL_SEC })
    return
  }
  memory.set(key, out)
}

async function clear(key) {
  if (redis) {
    await redis.del(key)
    return
  }
  memory.delete(key)
}

module.exports = { begin, load, commit, clear }
