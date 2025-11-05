"use client";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useState } from "react";

function short(a?: string){ if(!a) return "-"; return a.slice(0,6)+"…"+a.slice(-4); }

export default function WalletStatus(){
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const [busy, setBusy] = useState(false);

  const injectedConnector = connectors.find(c => c.id === injected().id) || connectors[0];

  async function onConnect(){
    try { setBusy(true); await connect({ connector: injectedConnector }); } finally { setBusy(false); }
  }
  async function onDisconnect(){
    try { setBusy(true); disconnect(); } finally { setBusy(false); }
  }

  useEffect(()=>{ if(connectError) console.warn("[wallet connect error]", connectError); },[connectError]);

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
      {isConnected ? (
        <>
          <span style={{
            background: 'var(--bg-panel-soft)',
            color: 'var(--text-secondary)',
            padding: '0.25rem 0.75rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            border: '1px solid var(--stroke)'
          }}>
            Chain: {chainId}
          </span>
          <span style={{
            background: 'var(--bg-panel-soft)',
            color: 'var(--text-primary)',
            padding: '0.25rem 0.75rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            border: '1px solid var(--stroke)',
            fontFamily: 'monospace'
          }}>
            {short(address)}
          </span>
          <button 
            className="btn btn-secondary" 
            onClick={onDisconnect} 
            disabled={busy}
            style={{fontSize: '0.875rem', padding: '0.5rem 1rem'}}
          >
            Disconnect
          </button>
        </>
      ) : (
        <button 
          className="btn btn-primary" 
          onClick={onConnect} 
          disabled={busy || connectStatus==="pending"}
          style={{fontSize: '0.875rem', padding: '0.5rem 1rem'}}
        >
          {connectStatus==="pending" || busy ? "Connecting..." : "Connect Wallet"}
        </button>
      )}
    </div>
  );
}
