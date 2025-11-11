import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis'
import { getTelemetryStats } from '@/lib/telemetry'

export async function GET(req: NextRequest) {
  try {
    const diagnostics = {
      timestamp: Date.now(),
      redis: {
        url: process.env.REDIS_URL ? 'SET' : 'MISSING',
        connection: false,
        pubsub: false,
        error: undefined as string | undefined
      },
      sse: {
        keepAliveInterval: '30s',
        maxConnections: 'unlimited',
        proxyTimeout: 'unknown'
      },
      rpc: {
        url: process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'MISSING',
        timeout: process.env.TX_TIMEOUT_MS || '30000ms'
      },
      connectors: {
        metamask: 'available',
        walletconnect: 'available',
        injected: 'available',
        note: 'Check browser console for actual connector availability'
      },
      telemetry: await getTelemetryStats()
    }

    // Test Redis connection
    try {
      const redis = await getRedis()
      if (redis) {
        await redis.ping()
        diagnostics.redis.connection = true
        
        // Test PubSub
        const pub = await redis.duplicate()
        const sub = await redis.duplicate()
        await pub.publish('test:channel', 'test')
        diagnostics.redis.pubsub = true
        await pub.disconnect()
        await sub.disconnect()
      }
    } catch (error: any) {
      diagnostics.redis.connection = false
      diagnostics.redis.error = error.message
    }

    return NextResponse.json({
      ok: true,
      diagnostics
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'DIAGNOSTICS_ERROR'
    }, { status: 500 })
  }
}
