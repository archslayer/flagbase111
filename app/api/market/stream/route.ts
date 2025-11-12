// app/api/market/stream/route.ts
// Server-Sent Events (SSE) endpoint for real-time price updates
// NEVER: Send quest/auth state, modify existing endpoints
// ALWAYS: Use indexer data, handle client disconnects gracefully

import { NextRequest, NextResponse } from 'next/server'
import { getAllLatestCorePrices, startPricePoller } from '@/lib/indexer/corePricesPoller'
import { acquireSSEConnection } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Route-first-start: Ensure poller is started when this route is first accessed
// This is idempotent (startPricePoller checks isInitialized internally)
let pollerStarted = false
if (!pollerStarted) {
  startPricePoller().catch((error) => {
    console.error('[MarketStream] Failed to start price poller:', error)
  })
  pollerStarted = true
}

/**
 * GET /api/market/stream
 * SSE endpoint that sends price updates every 5 seconds
 * Per-IP connection limit: 20 concurrent connections
 */
export async function GET(request: NextRequest) {
  // Get client IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown'

  // Check per-IP connection limit (max 20 concurrent SSE connections per IP)
  const connectionGuard = await acquireSSEConnection(`market:stream:${ip}`, 20)
  
  if (!connectionGuard.ok) {
    return NextResponse.json(
      {
        error: 'Too many concurrent connections',
        message: `Maximum 20 concurrent SSE connections per IP. Current: ${connectionGuard.current}`,
        retryAfter: 60,
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '20',
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  // Ensure poller is started (guard check)
  if (!pollerStarted) {
    await startPricePoller().catch((error) => {
      console.error('[MarketStream] Failed to start price poller:', error)
    })
    pollerStarted = true
  }

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Send initial connection message
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'))

      // Set up interval to send price updates
      const interval = setInterval(() => {
        try {
          const prices = getAllLatestCorePrices()

          // Convert Map to object format
          const pricesObj: Record<string, any> = {}
          Object.entries(prices).forEach(([id, data]) => {
            pricesObj[id] = {
              price8: data.price8,
              updatedAt: data.updatedAt.toISOString(),
              ...(data.name && { name: data.name }),
              ...(data.exists !== undefined && { exists: data.exists }),
            }
          })

          const message = {
            type: 'prices',
            data: pricesObj,
            timestamp: new Date().toISOString(),
          }

          controller.enqueue(encoder.encode(`event: prices\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`))
        } catch (error) {
          console.error('[MarketStream] Error sending prices:', error)
          // Send error event but keep connection alive
          const errorMessage = {
            type: 'error',
            message: 'Failed to fetch prices',
          }
          controller.enqueue(encoder.encode(`event: error\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`))
        }
      }, 5000) // 5 seconds interval

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
        // Release connection guard
        connectionGuard.release().catch((err) => {
          console.error('[MarketStream] Error releasing connection guard:', err)
        })
      })

      // Cleanup on stream close
      const cleanup = () => {
        clearInterval(interval)
        controller.close()
        // Release connection guard
        connectionGuard.release().catch((err) => {
          console.error('[MarketStream] Error releasing connection guard:', err)
        })
      }

      // Handle stream errors
      stream.cancel = () => {
        cleanup()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

// Alternative WebSocket implementation (commented out for future use)
// If SSE is not sufficient, uncomment and implement WebSocket server:
/*
import { Server as WebSocketServer } from 'ws'

export function setupPriceWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: '/api/market/ws' })
  
  wss.on('connection', (ws) => {
    const interval = setInterval(() => {
      const prices = getAllLatestCorePrices()
      ws.send(JSON.stringify({ type: 'prices', data: prices }))
    }, 5000)
    
    ws.on('close', () => {
      clearInterval(interval)
    })
  })
}
*/

