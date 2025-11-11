/**
 * Unit conversion utilities for FlagWars contracts
 * Handles conversions between USDC6, TOKEN18, and Price8 decimals
 */

export function toUSDC6FromPrice8(price8: number): number {
  // Price8 (8 decimals) -> USDC6 (6 decimals)
  // Divide by 1e2 (100)
  return Math.floor(price8 / 100);
}

export function toPrice8FromUSDC6(usdc6: number): number {
  // USDC6 (6 decimals) -> Price8 (8 decimals)
  // Multiply by 1e2 (100)
  return usdc6 * 100;
}

export function toWei18(amountTokenFloat: number): string {
  // Convert float token amount to 18-decimal wei
  return (amountTokenFloat * 1e18).toString();
}

export function fromWei18(amountWei: string): number {
  // Convert 18-decimal wei to float token amount
  return parseFloat(amountWei) / 1e18;
}

export function toUSDC6(amountFloat: number): number {
  // Convert float USDC amount to 6-decimal units
  return Math.floor(amountFloat * 1e6);
}

export function fromUSDC6(amountUSDC6: number): number {
  // Convert 6-decimal USDC to float amount
  return amountUSDC6 / 1e6;
}

export function bps(baseAmount: number, bpsValue: number): number {
  // Calculate basis points (BPS) of base amount
  return Math.floor((baseAmount * bpsValue) / 10000);
}

export function calculateBuyPrice(price8: number, kappa8: number): number {
  // STATIC Half-Step: P_buy = P + κ/2
  return price8 + (kappa8 / 2);
}

export function calculateSellPrice(price8: number, lambda8: number): number {
  // STATIC Half-Step: P_sell = P - λ/2
  return price8 - (lambda8 / 2);
}

export function calculateTotalCost(amountToken18: string, price8: number): number {
  // TOKEN18 × Price8 -> USDC6
  // (amountToken18 * price8) / 1e18 -> then / 1e2 for USDC6
  const amountFloat = fromWei18(amountToken18);
  const totalCost8 = amountFloat * price8;
  return toUSDC6FromPrice8(totalCost8);
}

export function applyFee(amountUSDC6: number, feeBps: number): { gross: number; fee: number; net: number } {
  const fee = bps(amountUSDC6, feeBps);
  return {
    gross: amountUSDC6,
    fee: fee,
    net: amountUSDC6 - fee
  };
}

export function splitFees(totalFeeUSDC6: number, referralShareBps: number, revenueShareBps: number): {
  referral: number;
  revenue: number;
} {
  const referral = bps(totalFeeUSDC6, referralShareBps);
  const revenue = totalFeeUSDC6 - referral;
  
  return { referral, revenue };
}

// Spec constants validation
export function validateSpecConstants(spec: any): {
  kappa8: number;
  lambda8: number;
  priceMin8: number;
  pricePrecision8: number;
} {
  const kappaFloat = parseFloat(spec.pricing.params.kappa);
  const lambdaFloat = parseFloat(spec.pricing.params.lambda);
  const priceMinFloat = parseFloat(spec.pricing.params.priceMin);
  const pricePrecisionFloat = parseFloat(spec.pricing.params.pricePrecision);
  
  // Convert to 8-decimal precision
  const kappa8 = Math.floor(kappaFloat * 1e8);
  const lambda8 = Math.floor(lambdaFloat * 1e8);
  const priceMin8 = Math.floor(priceMinFloat * 1e8);
  const pricePrecision8 = Math.floor(pricePrecisionFloat * 1e8);
  
  console.log(`📊 Spec constants validation:`);
  console.log(`   Kappa: ${kappaFloat} -> ${kappa8} (8 decimals)`);
  console.log(`   Lambda: ${lambdaFloat} -> ${lambda8} (8 decimals)`);
  console.log(`   PriceMin: ${priceMinFloat} -> ${priceMin8} (8 decimals)`);
  console.log(`   PricePrecision: ${pricePrecisionFloat} -> ${pricePrecision8} (8 decimals)`);
  
  return { kappa8, lambda8, priceMin8, pricePrecision8 };
}

export function validateFeeConstants(spec: any): {
  buyFeeBps: number;
  sellFeeBps: number;
  referralShareBps: number;
  revenueShareBps: number;
} {
  const buyFeeBps = spec.fees.buyFeeBps;
  const sellFeeBps = spec.fees.sellFeeBps;
  const referralShareBps = spec.fees.referralShareBps;
  const revenueShareBps = spec.fees.revenueShareBps;
  
  console.log(`💰 Fee constants validation:`);
  console.log(`   BuyFee: ${buyFeeBps} BPS (${buyFeeBps/100}%)`);
  console.log(`   SellFee: ${sellFeeBps} BPS (${sellFeeBps/100}%)`);
  console.log(`   ReferralShare: ${referralShareBps} BPS (${referralShareBps/100}%)`);
  console.log(`   RevenueShare: ${revenueShareBps} BPS (${revenueShareBps/100}%)`);
  
  // Validate BPS ranges
  if (buyFeeBps < 0 || buyFeeBps > 10000) throw new Error(`Invalid buyFeeBps: ${buyFeeBps}`);
  if (sellFeeBps < 0 || sellFeeBps > 10000) throw new Error(`Invalid sellFeeBps: ${sellFeeBps}`);
  if (referralShareBps < 0 || referralShareBps > 10000) throw new Error(`Invalid referralShareBps: ${referralShareBps}`);
  if (revenueShareBps < 0 || revenueShareBps > 10000) throw new Error(`Invalid revenueShareBps: ${revenueShareBps}`);
  
  // Validate referral + revenue = 100%
  if (referralShareBps + revenueShareBps !== 10000) {
    throw new Error(`Invalid fee split: ${referralShareBps} + ${revenueShareBps} != 10000`);
  }
  
  return { buyFeeBps, sellFeeBps, referralShareBps, revenueShareBps };
}