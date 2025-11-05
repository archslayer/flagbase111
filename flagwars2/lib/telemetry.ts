import { getRedis } from './redis'

const TELEMETRY_PREFIX = 'telemetry:'

// Transaction status counters
export async function incrementTxStatus(status: 'CONFIRMED' | 'FAILED', txType?: 'buy' | 'sell' | 'attack') {
  const redis = await getRedis()
  if (!redis) return

  const timestamp = Math.floor(Date.now() / 1000)
  const hour = Math.floor(timestamp / 3600)
  
  try {
    // Global counters
    await redis.hincrby(`${TELEMETRY_PREFIX}tx:global`, status, 1)
    
    // Hourly counters
    await redis.hincrby(`${TELEMETRY_PREFIX}tx:hourly:${hour}`, status, 1)
    
    // Type-specific counters
    if (txType) {
      await redis.hincrby(`${TELEMETRY_PREFIX}tx:${txType}`, status, 1)
      await redis.hincrby(`${TELEMETRY_PREFIX}tx:${txType}:hourly:${hour}`, status, 1)
    }
    
    // Set TTL for hourly data (keep 7 days)
    await redis.expire(`${TELEMETRY_PREFIX}tx:hourly:${hour}`, 7 * 24 * 3600)
    if (txType) {
      await redis.expire(`${TELEMETRY_PREFIX}tx:${txType}:hourly:${hour}`, 7 * 24 * 3600)
    }
  } catch (error) {
    console.error('Telemetry increment error:', error)
  }
}

// Redis PubSub error counters
export async function incrementRedisError(errorType: 'publish' | 'subscribe' | 'connection') {
  const redis = await getRedis()
  if (!redis) return

  const timestamp = Math.floor(Date.now() / 1000)
  const hour = Math.floor(timestamp / 3600)
  
  try {
    // Global Redis error counter
    await redis.hincrby(`${TELEMETRY_PREFIX}redis:global`, errorType, 1)
    
    // Hourly Redis error counter
    await redis.hincrby(`${TELEMETRY_PREFIX}redis:hourly:${hour}`, errorType, 1)
    
    // Set TTL for hourly data (keep 7 days)
    await redis.expire(`${TELEMETRY_PREFIX}redis:hourly:${hour}`, 7 * 24 * 3600)
  } catch (error) {
    console.error('Redis telemetry increment error:', error)
  }
}

// Get telemetry stats
export async function getTelemetryStats(): Promise<{
  tx: { CONFIRMED: number; FAILED: number }
  redis: { publish: number; subscribe: number; connection: number }
  hourly: Array<{ hour: number; tx: { CONFIRMED: number; FAILED: number }; redis: { publish: number; subscribe: number; connection: number } }>
}> {
  const redis = await getRedis()
  if (!redis) {
    return {
      tx: { CONFIRMED: 0, FAILED: 0 },
      redis: { publish: 0, subscribe: 0, connection: 0 },
      hourly: []
    }
  }

  try {
    // Get global stats
    const txGlobal = await redis.hgetall(`${TELEMETRY_PREFIX}tx:global`)
    const redisGlobal = await redis.hgetall(`${TELEMETRY_PREFIX}redis:global`)
    
    // Get last 24 hours of hourly data
    const now = Math.floor(Date.now() / 1000)
    const hourly = []
    
    for (let i = 0; i < 24; i++) {
      const hour = Math.floor((now - i * 3600) / 3600)
      const txHourly = await redis.hgetall(`${TELEMETRY_PREFIX}tx:hourly:${hour}`)
      const redisHourly = await redis.hgetall(`${TELEMETRY_PREFIX}redis:hourly:${hour}`)
      
      hourly.push({
        hour,
        tx: {
          CONFIRMED: parseInt(txHourly.CONFIRMED || '0'),
          FAILED: parseInt(txHourly.FAILED || '0')
        },
        redis: {
          publish: parseInt(redisHourly.publish || '0'),
          subscribe: parseInt(redisHourly.subscribe || '0'),
          connection: parseInt(redisHourly.connection || '0')
        }
      })
    }
    
    return {
      tx: {
        CONFIRMED: parseInt(txGlobal.CONFIRMED || '0'),
        FAILED: parseInt(txGlobal.FAILED || '0')
      },
      redis: {
        publish: parseInt(redisGlobal.publish || '0'),
        subscribe: parseInt(redisGlobal.subscribe || '0'),
        connection: parseInt(redisGlobal.connection || '0')
      },
      hourly: hourly.reverse() // Most recent first
    }
  } catch (error) {
    console.error('Telemetry stats error:', error)
    return {
      tx: { CONFIRMED: 0, FAILED: 0 },
      redis: { publish: 0, subscribe: 0, connection: 0 },
      hourly: []
    }
  }
}

// Health check with telemetry
export async function getHealthStatus(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy'
  details: {
    redis: boolean
    recentErrors: number
    successRate: number
  }
}> {
  const stats = await getTelemetryStats()
  const recentErrors = stats.hourly.slice(-6).reduce((sum, h) => 
    sum + h.tx.FAILED + h.redis.publish + h.redis.subscribe + h.redis.connection, 0)
  
  const totalRecent = stats.hourly.slice(-6).reduce((sum, h) => 
    sum + h.tx.CONFIRMED + h.tx.FAILED, 0)
  
  const successRate = totalRecent > 0 ? (stats.tx.CONFIRMED / (stats.tx.CONFIRMED + stats.tx.FAILED)) : 1
  
  return {
    status: recentErrors > 10 || successRate < 0.9 ? 'degraded' : 'healthy',
    details: {
      redis: true, // TODO: Check actual Redis connection
      recentErrors,
      successRate
    }
  }
}
