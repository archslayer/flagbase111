"use client";
import { useAccount } from "wagmi";
import { env } from "@/lib/env";

export default function HomeView() {
  const { address, isConnected } = useAccount();
  const missing = [];
  if (!env.RPC_BASE_SEPOLIA) missing.push("NEXT_PUBLIC_RPC_BASE_SEPOLIA");
  if (!env.CORE) missing.push("NEXT_PUBLIC_CORE_ADDRESS");
  if (!env.USDC) missing.push("NEXT_PUBLIC_USDC_ADDRESS");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {missing.length > 0 && (
        <div style={{ padding: 12, border: "1px solid #f00" }}>
          Missing env keys: {missing.join(", ")}
        </div>
      )}
      <button>Connect Wallet</button>
      <div>Connected: {isConnected ? "yes" : "no"}</div>
      <div>Address: {address ?? "-"}</div>
    </div>
  );
}
