import type { NextRequest } from 'next/server'
import { getTxEmitter, getTxOwner } from '@/lib/tx'
import { getUserAddressFromJWT } from '@/lib/jwt'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  
  if (!id) {
    return new Response('Missing id parameter', { status: 400 })
  }

  // JWT auth from cookie
  const user = await getUserAddressFromJWT(req)
  if (!user) return new Response('UNAUTH', { status: 401 })

  // txId sahipliği doğrula - sadece kendi tx'ine abone olabilsin
  const owner = getTxOwner(id)
  if (owner && owner.toLowerCase() !== user.toLowerCase()) {
    return new Response('FORBIDDEN', { status: 403 })
  }

  const encoder = new TextEncoder()
  const channel = `tx:${id}`
  
  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Initial connection confirmation
      write('hello', { id })

      // Set retry interval
      controller.enqueue(encoder.encode('retry: 5000\n\n'))

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15000)

      // Memory EventEmitter fallback
      const memEmitter = getTxEmitter(id)
      const onMemStatus = (status: string) => write('status', { id, status })
      const onMemPrice = (payload: any) => write('price', payload)
      memEmitter.on('status', onMemStatus)
      memEmitter.on('price', onMemPrice)

      // Redis PubSub subscription (if available)
      let redisUnsub: (() => Promise<void>) | null = null
      try {
        const { getRedisSub } = require('@/lib/redis')
        const sub = await getRedisSub()
        if (sub) {
          const handler = (message: string, ch: string) => {
            if (ch !== channel) return
            try {
              const data = JSON.parse(message)
              if (data.event === 'price') {
                write('price', data)
              } else {
                write('status', { id, status: data.status })
              }
            } catch (err: any) {
              console.log('Redis message parse error:', err)
            }
          }
          
          await sub.subscribe(channel, handler)
          redisUnsub = async () => {
            try {
              await sub.unsubscribe(channel, handler)
            } catch (err: any) {
              console.log('Redis unsubscribe error:', err)
              // Telemetri: Redis subscribe error
              try {
                const { incrementRedisError } = require('@/lib/telemetry')
                incrementRedisError('subscribe')
              } catch {}
            }
          }
        }
      } catch (err: any) {
        console.log('Redis subscription failed, using EventEmitter fallback:', err.message)
        // Telemetri: Redis subscribe error
        try {
          const { incrementRedisError } = require('@/lib/telemetry')
          incrementRedisError('subscribe')
        } catch {}
      }

      // Cleanup function
      return async () => {
        clearInterval(keepAlive)
        memEmitter.off('status', onMemStatus)
        memEmitter.off('price', onMemPrice)
        if (redisUnsub) await redisUnsub()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
