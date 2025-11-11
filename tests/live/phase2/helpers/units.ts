const { parseUnits, formatUnits } = require("viem");

// Unit conversion helpers
function u18(n: string | number): bigint {
  return parseUnits(n.toString(), 18);
}

function toUSDC6(n: number): bigint {
  return parseUnits(n.toString(), 6);
}

function fmt8(price8: bigint): string {
  return formatUnits(price8, 8);
}

function fmt6(usdc6: bigint): string {
  return formatUnits(usdc6, 6);
}

function fmt18(token18: bigint): string {
  return formatUnits(token18, 18);
}

// Price conversion: TOKEN18 * price8 / 1e20 = USDC6
function token18AtPrice8ToUSDC6(amountToken18: bigint, price8: bigint): bigint {
  if (amountToken18 === 0n) return 0n;
  return (amountToken18 * price8) / BigInt(1e20);
}

// Slippage calculation
function calculateSlippage(amount: bigint, slippageBps: number = 200): bigint {
  return (amount * BigInt(10000 - slippageBps)) / BigInt(10000);
}

module.exports = { 
  u18, 
  toUSDC6, 
  fmt8, 
  fmt6, 
  fmt18, 
  token18AtPrice8ToUSDC6, 
  calculateSlippage 
};
