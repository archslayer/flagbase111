import { useEffect, useRef } from 'react'

type TxSSEHandlers = { 
  onStatus?: (status: string) => void
  onPrice?: (payload: any) => void 
}

export function useTxSSE(txId?: string, handlers: TxSSEHandlers = {}) {
  const esRef = useRef<EventSource | null>(null)
  const lastEventRef = useRef<string>('')
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!txId) return

    let closed = false
    let reconnectDelay = 1000 // Start with 1 second

    function connect() {
      if (closed) return

      const es = new EventSource(`/api/sse/tx?id=${txId}`, { withCredentials: true })
      esRef.current = es

      es.addEventListener('status', (e: any) => {
        if (closed) return
        
        const eventKey = `status:${e.data}`
        if (lastEventRef.current === eventKey) return
        lastEventRef.current = eventKey
        
        try {
          const { status } = JSON.parse(e.data)
          handlers.onStatus?.(status)
        } catch (error) {
          console.error('Failed to parse status event:', error)
        }
      })

      es.addEventListener('price', (e: any) => {
        if (closed) return
        
        const eventKey = `price:${e.data}`
        if (lastEventRef.current === eventKey) return
        lastEventRef.current = eventKey
        
        try {
          const payload = JSON.parse(e.data)
          handlers.onPrice?.(payload)
        } catch (error) {
          console.error('Failed to parse price event:', error)
        }
      })

      es.onopen = () => {
        // Reset reconnect delay on successful connection
        reconnectDelay = 1000
      }

      es.onerror = () => {
        if (closed) return
        es.close()
        
        // Exponential backoff for reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!closed) {
            connect()
            reconnectDelay = Math.min(reconnectDelay * 2, 30000) // Max 30 seconds
          }
        }, reconnectDelay)
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      esRef.current?.close()
      esRef.current = null
    }
  }, [txId, handlers.onStatus, handlers.onPrice])
}