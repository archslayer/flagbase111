import { z } from "zod";

const PublicEnv = z.object({
  NEXT_PUBLIC_NETWORK: z.string().optional(),
  NEXT_PUBLIC_CHAIN_ID: z.string().optional(),
  NEXT_PUBLIC_RPC_BASE_SEPOLIA: z.string().optional(),
  NEXT_PUBLIC_CORE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_ACHIEVEMENTS_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_USDC_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_DISABLE_GUARDS: z.string().optional()
});

const parsed = PublicEnv.safeParse({
  NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_RPC_BASE_SEPOLIA: process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA,
  NEXT_PUBLIC_CORE_ADDRESS: process.env.NEXT_PUBLIC_CORE_ADDRESS,
  NEXT_PUBLIC_ACHIEVEMENTS_ADDRESS: process.env.NEXT_PUBLIC_ACHIEVEMENTS_ADDRESS,
  NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_DISABLE_GUARDS: process.env.NEXT_PUBLIC_DISABLE_GUARDS
});

const p = parsed.success ? parsed.data : {};

export const env = {
  NETWORK: p.NEXT_PUBLIC_NETWORK || "",
  CHAIN_ID: p.NEXT_PUBLIC_CHAIN_ID || "",
  RPC_BASE_SEPOLIA: p.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "",
  CORE: p.NEXT_PUBLIC_CORE_ADDRESS || "",
  ACHIEVEMENTS: p.NEXT_PUBLIC_ACHIEVEMENTS_ADDRESS || "",
  USDC: p.NEXT_PUBLIC_USDC_ADDRESS || "",
  APP_URL: p.NEXT_PUBLIC_APP_URL || "",
  DISABLE_GUARDS: p.NEXT_PUBLIC_DISABLE_GUARDS === "1" ? true : false
};
