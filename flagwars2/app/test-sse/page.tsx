"use client";
import { useSSE } from "@/lib/useSSE";
import { useState } from "react";

interface EventData {
  type: string;
  data: any;
  timestamp: number;
}

export default function TestSSEPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const { isConnected: sseConnected, isReconnecting, lastError } = useSSE({
    url: '/api/events',
    types: ['attack', 'buy', 'sell', 'connection'],
    authToken: 'demo-token', // Mock token
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(prev => [data, ...prev].slice(0, 50)); // Keep last 50 events
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    },
    onOpen: () => {
      setIsConnected(true);
    },
    onClose: () => {
      setIsConnected(false);
    },
    onError: (error) => {
      console.error('SSE error:', error);
    }
  });

  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <div>
      <h1>SSE Test Page</h1>
      
      <div className="card" style={{marginBottom: '2rem'}}>
        <div className="card-header">
          <h2>Connection Status</h2>
        </div>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: sseConnected ? '#10b981' : isReconnecting ? '#f59e0b' : '#ef4444'
          }}></div>
          <span>
            {sseConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}
          </span>
          {lastError && (
            <span style={{color: '#ef4444', fontSize: '0.875rem'}}>
              Error: {lastError}
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h2>Live Events ({events.length})</h2>
          <button 
            className="btn btn-secondary" 
            onClick={clearEvents}
            style={{fontSize: '0.875rem', padding: '0.5rem 1rem'}}
          >
            Clear
          </button>
        </div>
        
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '1rem',
          background: 'var(--bg-panel-soft)',
          borderRadius: '0.5rem'
        }}>
          {events.length === 0 ? (
            <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2rem'}}>
              No events yet. Waiting for live updates...
            </div>
          ) : (
            events.map((event, index) => (
              <div 
                key={index} 
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: 'var(--bg-panel)',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--stroke)',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                  <span style={{
                    background: event.type === 'attack' ? '#ef4444' : 
                              event.type === 'buy' ? '#10b981' : 
                              event.type === 'sell' ? '#f59e0b' : '#6b7280',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {event.type.toUpperCase()}
                  </span>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.75rem'}}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                <div style={{fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                  {JSON.stringify(event.data, null, 2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
