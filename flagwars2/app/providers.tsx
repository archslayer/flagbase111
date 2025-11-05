'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected } from '@wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';

const queryClient = new QueryClient();

export const config = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA) },
  connectors: [
    injected({ target: 'metaMask', shimDisconnect: true }), // 👈 Önce MetaMask hedefle
    injected({ shimDisconnect: true }), // Yedek: generic injected
  ],
  autoConnect: false,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
