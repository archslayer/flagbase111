const { readCountry } = require('./read');
const { deltaP8, token18ToUsdc6 } = require('./units');

// κ/λ ölçüm (varsayımsız): ardışık 2 işlem sonrası P farkı
async function inferStep8ByConsecutiveReads(countryId) {
  const a = await readCountry(countryId);
  // Burada zincire müdahale ETMİYORUZ; step ölçümü "işlem sonrası" runner içinde alınacak.
  return { price8: a.price8, inferredStep8Abs: null };
}

// Beklenen USDC6 cost/proceeds hesapları (price8 ile)
function expectedBuyCostUSDC6(amountToken18, executionPrice8) {
  return token18ToUsdc6(amountToken18, executionPrice8); // buyFeeBps=0 kabul, canlıda fee varsa fark olarak raporlanır
}

function expectedSellProceedsUSDC6(amountToken18, executionPrice8, sellFeeBps) {
  const gross = token18ToUsdc6(amountToken18, executionPrice8);
  const fee = (gross * BigInt(sellFeeBps)) / 10000n;
  return { grossUSDC6: gross, feeUSDC6: fee, netUSDC6: gross - fee };
}

module.exports = { inferStep8ByConsecutiveReads, expectedBuyCostUSDC6, expectedSellProceedsUSDC6 };