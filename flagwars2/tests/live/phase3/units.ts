// UNIT HELPERS: TOKEN18 ↔ USDC6 ↔ PRICE8
const ONE_E18 = 10n ** 18n;
const ONE_E8  = 10n ** 8n;

// TOKEN18 * PRICE8 -> USDC6
function token18ToUsdc6(amountToken18, price8) {
  // (amount * price8) / 1e18 => USDC8, sonra /1e2 => USDC6
  return (amountToken18 * price8) / ONE_E18 / 100n;
}

// κ/λ çıkarımı için deltaP = P_after - P_before (PRICE8 cinsinden)
function deltaP8(before, after) {
  return (after >= before) ? (after - before) : -(before - after);
}

// minOut hesap yardımcıları (slippage BPS)
function withSlippageDown(usdc6, bps) {
  return (usdc6 * BigInt(10000 - bps)) / 10000n;
}

module.exports = { ONE_E18, ONE_E8, token18ToUsdc6, deltaP8, withSlippageDown };