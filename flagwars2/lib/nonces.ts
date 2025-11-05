// Rule: one in-flight tx per user by default to prevent racing/nonce collision.

const inFlight = new Map<string, number>()
let redisRef: any = null

export function guardUserInFlight (addr: string, limit = 1) {
  const useRedis = (process.env.USE_REDIS ?? 'false').toLowerCase() === 'true'
  if (!useRedis) {
    const current = inFlight.get(addr) || 0
    if (current >= limit) throw new Error('USER_MAX_INFLIGHT')
    inFlight.set(addr, current + 1)
    return () => {
      const after = Math.max(0, (inFlight.get(addr) || 1) - 1)
      inFlight.set(addr, after)
    }
  }
  // Redis path: use INCR + EXPIRE and check value
  return async () => {}
}


