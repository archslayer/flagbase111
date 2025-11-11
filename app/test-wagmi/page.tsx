"use client";
import { useAccount } from "wagmi";

export default function TestWagmiPage() {
  const { address, isConnected } = useAccount();

  return (
    <div>
      <h1>Wagmi Test Page</h1>
      <div style={{padding: '1rem', background: 'var(--bg-panel)', borderRadius: '0.5rem'}}>
        <div>Connected: {isConnected ? "Yes" : "No"}</div>
        <div>Address: {address || "Not connected"}</div>
      </div>
    </div>
  );
}
