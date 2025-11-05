// BigInt utilities for consistent handling
// On-chain amounts should always be BigInt, UI display can be Number

export const E6 = 1_000_000n;  // USDC 6 decimals
export const E18 = 1_000_000_000_000_000_000n;  // Token 18 decimals

// Safe BigInt conversion
export const toBigIntSafe = (x: string | number | bigint): bigint => {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'string') return BigInt(x);
  if (typeof x === 'number') return BigInt(Math.floor(x));
  throw new Error(`Cannot convert ${typeof x} to BigInt`);
};

// USDC total (USDC6, string/bigint) -> %2 slippage margin maxInUSDC6 (bigint)
export const calcMaxInUSDC6 = (usdcTotal: string | bigint): bigint => {
  const u = toBigIntSafe(usdcTotal);
  return (u * 102n) / 100n; // +2% slippage margin
};

// Check if approval is needed (both must be BigInt)
export const needsApproval = (allowance: bigint, requiredAmount: bigint): boolean => {
  return allowance < requiredAmount;
};

// Format BigInt for display (only for UI)
export const formatBigIntForDisplay = (value: bigint, decimals: number = 18): string => {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.replace(/0+$/, '');
  
  if (trimmed === '') {
    return whole.toString();
  }
  
  return `${whole}.${trimmed}`;
};

// Parse user input to BigInt (for amounts)
export const parseAmountToBigInt = (input: string, decimals: number = 18): bigint => {
  const num = parseFloat(input);
  if (isNaN(num) || num < 0) return 0n;
  
  const multiplier = 10n ** BigInt(decimals);
  return BigInt(Math.floor(num * Number(multiplier)));
};

// Calculate deadline (current timestamp + seconds)
export const calcDeadlineBigInt = (seconds: number = 300): bigint => {
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(seconds);
};
