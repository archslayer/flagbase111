// Centralized address management
// Single source of truth for contract addresses

const CORE_ADDRESS_RAW = process.env.NEXT_PUBLIC_CORE_ADDRESS as string;
const USDC_ADDRESS_RAW = process.env.NEXT_PUBLIC_USDC_ADDRESS as string;
const TOKEN_TR_RAW = process.env.TOKEN_TR_ADDRESS as string;
const TOKEN_UK_RAW = process.env.TOKEN_UK_ADDRESS as string;
const TOKEN_US_RAW = process.env.TOKEN_US_ADDRESS as string;

if (!CORE_ADDRESS_RAW || !USDC_ADDRESS_RAW) {
  throw new Error('Missing CORE/USDC environment variables');
}

export const CORE_ADDRESS = CORE_ADDRESS_RAW as `0x${string}`;
export const USDC_ADDRESS = USDC_ADDRESS_RAW as `0x${string}`;
export const TOKEN_TR = TOKEN_TR_RAW as `0x${string}`;
export const TOKEN_UK = TOKEN_UK_RAW as `0x${string}`;
export const TOKEN_US = TOKEN_US_RAW as `0x${string}`;

// Expected CORE address (runtime validation)
// Falls back to CORE_ADDRESS if NEXT_PUBLIC_EXPECTED_CORE_ADDRESS is not set
const EXPECTED_CORE_RAW = (process.env.NEXT_PUBLIC_EXPECTED_CORE_ADDRESS || CORE_ADDRESS_RAW) as string;
export const EXPECTED_CORE = EXPECTED_CORE_RAW as `0x${string}`;

// Token address mapping by country ID
export const TOKEN_ADDRESSES: Record<number, `0x${string}`> = {
  90: TOKEN_TR,
  44: TOKEN_UK,
  1: TOKEN_US
};

// Validation helper
export function validateAddresses(): { core: string; usdc: string; tokens: Record<number, string> } {
  return {
    core: CORE_ADDRESS,
    usdc: USDC_ADDRESS,
    tokens: {
      90: TOKEN_TR,
      44: TOKEN_UK,
      1: TOKEN_US
    }
  };
}
