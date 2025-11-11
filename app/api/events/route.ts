import { NextRequest } from "next/server";

// SSE endpoint for real-time updates
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  // Simple auth check - replace with real JWT validation
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const initialMessage = `data: ${JSON.stringify({
        type: 'connection',
        message: 'Connected to FlagWars events',
        timestamp: Date.now()
      })}\n\n`;
      
      controller.enqueue(new TextEncoder().encode(initialMessage));

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        const heartbeatMessage = `data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        })}\n\n`;
        
        try {
          controller.enqueue(new TextEncoder().encode(heartbeatMessage));
        } catch (error) {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Send mock events for demo
      const eventInterval = setInterval(() => {
        const events = [
          {
            type: 'attack',
            data: {
              id: Math.random().toString(36).substr(2, 9),
              countryId: Math.floor(Math.random() * 35) + 1,
              attacker: '0x' + Math.random().toString(16).substr(2, 40),
              amount: (Math.random() * 10).toFixed(2),
              timestamp: Date.now()
            }
          },
          {
            type: 'buy',
            data: {
              id: Math.random().toString(36).substr(2, 9),
              countryId: Math.floor(Math.random() * 35) + 1,
              buyer: '0x' + Math.random().toString(16).substr(2, 40),
              amount: (Math.random() * 5).toFixed(2),
              price: (Math.random() * 1000).toFixed(2),
              timestamp: Date.now()
            }
          },
          {
            type: 'sell',
            data: {
              id: Math.random().toString(36).substr(2, 9),
              countryId: Math.floor(Math.random() * 35) + 1,
              seller: '0x' + Math.random().toString(16).substr(2, 40),
              amount: (Math.random() * 3).toFixed(2),
              price: (Math.random() * 800).toFixed(2),
              timestamp: Date.now()
            }
          }
        ];

        const randomEvent = events[Math.floor(Math.random() * events.length)];
        const eventMessage = `data: ${JSON.stringify(randomEvent)}\n\n`;
        
        try {
          controller.enqueue(new TextEncoder().encode(eventMessage));
        } catch (error) {
          clearInterval(eventInterval);
        }
      }, 10000); // Send event every 10 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        clearInterval(eventInterval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}
