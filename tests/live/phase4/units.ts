const ONE_E18 = 10n ** 18n
const ONE_E8  = 10n ** 8n
function token18ToUsdc6(amountToken18, price8) {
  return (amountToken18 * price8) / ONE_E18 / 100n  // 8->6 decimals
}
function deltaP8(b, a) { return a >= b ? a - b : -(b - a) }
function withSlippageDown(usdc6, bps) { return (usdc6 * BigInt(10000 - bps)) / 10000n }

module.exports = { ONE_E18, ONE_E8, token18ToUsdc6, deltaP8, withSlippageDown }
