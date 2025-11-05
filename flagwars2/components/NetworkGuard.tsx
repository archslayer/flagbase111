"use client";
import { useAccount, useChainId } from "wagmi";

const BASE_SEPOLIA_CHAIN_ID = 84532;

export default function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  // If not connected, show children (wallet connection will handle network)
  if (!isConnected) {
    return <>{children}</>;
  }

  // If connected but wrong network, show warning
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
    return (
      <div style={{
        background: 'var(--amber)',
        color: 'var(--text-dark)',
        padding: '1rem',
        textAlign: 'center',
        fontWeight: '600',
        borderBottom: '2px solid var(--orange)'
      }}>
        ⚠️ Unsupported network (Chain ID: {chainId}). Please switch to Base Sepolia (84532) to continue.
      </div>
    );
  }

  // Correct network, show children
  return <>{children}</>;
}
