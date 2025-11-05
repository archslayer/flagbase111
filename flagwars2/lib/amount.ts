export const ONE_TOKEN = 10n ** 18n
export const ONE_E8 = 10n ** 8n
export const ONE_E6 = 10n ** 6n

export function intTokensToWei(count: string): bigint {
  if (!/^\d+$/.test(count)) throw new Error('ONLY_INTEGER_TOKENS')
  const n = BigInt(count)
  if (n <= 0n) throw new Error('AMOUNT_MUST_BE_POSITIVE')
  return n * ONE_TOKEN
}

export function token18ToUsdc6(amountToken18: bigint, price8: bigint): bigint {
  // Convert TOKEN18 * price8 (8 decimals) to USDC6 (6 decimals)
  // Formula: (amountToken18 * price8) / (10^18 * 10^8) * 10^6
  // Simplified: (amountToken18 * price8) / 10^20
  return (amountToken18 * price8) / (10n ** 20n)
}

export function calcMinOut(usdcTotal: bigint, slippageBps = 200n): bigint {
  // Slippage protection for SELL: %2 default (200 basis points)
  // Formula: usdcTotal * (1 - slippageBps/10000)
  return usdcTotal * (10000n - slippageBps) / 10000n
}

export function calcMaxIn(usdcTotal: bigint, slippageBps = 200n): bigint {
  // Slippage protection for BUY: %2 default (200 basis points)
  // Formula: usdcTotal * (1 + slippageBps/10000)
  return usdcTotal * (10000n + slippageBps) / 10000n
}

// Alias functions for clarity
export function addMaxInSlippage(usdc6: bigint, bps = 200n): bigint {
  return calcMaxIn(usdc6, bps)
}

export function minusMinOutSlippage(usdc6: bigint, bps = 200n): bigint {
  return calcMinOut(usdc6, bps)
}

export function calcDeadline(secondsFromNow = 300): number {
  // Default 5 minutes from now
  return Math.floor(Date.now() / 1000) + secondsFromNow
}

// ---------- SLIPPAGE HELPERS ----------

/**
 * Add slippage to maxIn (for BUY operations)
 * Contract checks grossUSDC6 against maxIn, so we use gross + fee + slippage
 */
export function calcBuyMaxInWithSlippage(
  grossUSDC6: bigint,
  feeUSDC6: bigint,
  slippageBps = 200n // 2% default
): bigint {
  const netUSDC6 = grossUSDC6 + feeUSDC6
  return (netUSDC6 * (10000n + slippageBps)) / 10000n
}

/**
 * Subtract slippage from minOut (for SELL operations)
 */
export function calcSellMinOutWithSlippage(
  netUSDC6: bigint,
  slippageBps = 200n // 2% default
): bigint {
  return (netUSDC6 * (10000n - slippageBps)) / 10000n
}

// ---------- EXACT INTEGER MATH FOR BUY/SELL (NO FLOATS) ----------
export function divCeil(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b
}

/**
 * BUY exact calculation matching contract formula
 * @param nTokens18 - Amount in token18 units (e.g. 1e18 for 1 token)
 * @param price8 - Current price in price8 units (8 decimals)
 * @param kappa - Kappa parameter from cfg (8 decimals)
 * @param buyFeeBps - Buy fee in basis points (from cfg)
 * @returns Object with grossUSDC6, feeUSDC6, netUSDC6
 */
export function calcBuyCostUSDC6Exact(
  nTokens18: bigint,
  price8: bigint,
  kappa: bigint,
  buyFeeBps: bigint
): { grossUSDC6: bigint; feeUSDC6: bigint; netUSDC6: bigint } {
  if (nTokens18 <= 0n) return { grossUSDC6: 0n, feeUSDC6: 0n, netUSDC6: 0n }
  
  const n = nTokens18 / ONE_TOKEN // whole tokens (e.g. 1n)
  
  // Contract formula: totalPrice8 = n*P + κ*(n²)/2
  const linear8 = n * price8
  const quad8 = (kappa * n * n) / 2n
  const totalPrice8 = linear8 + quad8
  
  // Convert 8 decimals → 6 decimals (USDC)
  const grossUSDC6 = totalPrice8 / 100n
  
  // BUY fee is ADDED to gross (user pays more)
  const feeUSDC6 = (grossUSDC6 * buyFeeBps) / 10000n
  const netUSDC6 = grossUSDC6 + feeUSDC6
  
  return { grossUSDC6, feeUSDC6, netUSDC6 }
}

/**
 * SELL exact calculation matching contract formula
 * @param nTokens18 - Amount in token18 units (e.g. 1e18 for 1 token)
 * @param price8 - Current price in price8 units (8 decimals)
 * @param lambda - Lambda parameter from cfg (8 decimals)
 * @param sellFeeBps - Sell fee in basis points (from cfg)
 * @returns Object with grossUSDC6, feeUSDC6, netUSDC6
 */
export function calcSellProceedsUSDC6Exact(
  nTokens18: bigint,
  price8: bigint,
  lambda: bigint,
  sellFeeBps: bigint
): { grossUSDC6: bigint; feeUSDC6: bigint; netUSDC6: bigint } {
  if (nTokens18 <= 0n) return { grossUSDC6: 0n, feeUSDC6: 0n, netUSDC6: 0n }
  
  const n = nTokens18 / ONE_TOKEN // whole tokens
  
  // Contract formula: totalPrice8 = n*P − λ*(n²)/2
  const linear8 = n * price8
  const quad8 = (lambda * n * n) / 2n
  
  // Underflow protection
  const totalPrice8 = linear8 > quad8 ? (linear8 - quad8) : 0n
  
  // Convert 8 decimals → 6 decimals (USDC)
  const grossUSDC6 = totalPrice8 / 100n
  
  // SELL fee is SUBTRACTED from gross (user receives less)
  const feeUSDC6 = (grossUSDC6 * sellFeeBps) / 10000n
  const netUSDC6 = grossUSDC6 > feeUSDC6 ? (grossUSDC6 - feeUSDC6) : 0n
  
  return { grossUSDC6, feeUSDC6, netUSDC6 }
}


