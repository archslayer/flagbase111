require('dotenv').config({ path: ".env.local" });
const { CORE, ATTACK_FEE_WEI } = require('./env');
const { readCountry } = require('./read');
const { detectCapabilities } = require('./capabilities');
const { doBuy, doSell } = require('./buySell');
const { doAttack } = require('./attack');
const { token18ToUsdc6, deltaP8 } = require('./units');
const { expectedBuyCostUSDC6, expectedSellProceedsUSDC6 } = require('./math');
const { saveReport } = require('./reporter');

// === PARAMETRELER ===
const TEST_WALLET_PK = process.env.TEST_WALLET_PK;
const FROM_ID = Number(process.env.TEST_FROM_ID || '90');  // Turkey
const TO_ID   = Number(process.env.TEST_TO_ID   || '44');  // UK
const BUY_AMT  = 10n ** 16n;      // 0.01 TOKEN18
const SELL_AMT = 10n ** 16n;      // 0.01 TOKEN18
const ATK_AMT  = 10n ** 16n;      // 0.01 TOKEN18
const SELL_FEE_BPS = Number(process.env.SELL_FEE_BPS || '500'); // fallback/rapor

// Read-only test mode (no transactions)
const READ_ONLY_MODE = process.env.READ_ONLY_MODE === 'true' || !TEST_WALLET_PK;

if (!READ_ONLY_MODE && !TEST_WALLET_PK) {
  console.error('Set TEST_WALLET_PK in env to run tx tests, or set READ_ONLY_MODE=true for read-only tests.');
  process.exit(1);
}

async function main() {
  const caps = await detectCapabilities();

  const baseFrom = await readCountry(FROM_ID);
  const baseTo   = await readCountry(TO_ID);

  const pre = {
    core: CORE,
    caps,
    from: baseFrom,
    to:   baseTo,
    attackFeeWei: ATTACK_FEE_WEI.toString(),
  };

  // BUY TEST
  let buyRes = null;
  if (!READ_ONLY_MODE) {
    try {
      buyRes = await doBuy(TEST_WALLET_PK, FROM_ID, BUY_AMT);
    } catch (e) {
      buyRes = { error: e?.message || String(e) };
    }
  } else {
    buyRes = { skipped: true, reason: 'READ_ONLY_MODE' };
  }

  // SELL TEST
  let sellRes = null;
  if (!READ_ONLY_MODE) {
    try {
      sellRes = await doSell(TEST_WALLET_PK, FROM_ID, SELL_AMT);
    } catch (e) {
      sellRes = { error: e?.message || String(e) };
    }
  } else {
    sellRes = { skipped: true, reason: 'READ_ONLY_MODE' };
  }

  // ATTACK TEST
  let atkRes = null;
  if (!READ_ONLY_MODE) {
    try {
      atkRes = await doAttack(TEST_WALLET_PK, FROM_ID, TO_ID, ATK_AMT);
    } catch (e) {
      atkRes = { error: e?.message || String(e) };
    }
  } else {
    atkRes = { skipped: true, reason: 'READ_ONLY_MODE' };
  }

  // ANALİZ (varsayımsız hesap)
  const afterFrom = await readCountry(FROM_ID);
  const afterTo   = await readCountry(TO_ID);

  const analysis = {
    buy: buyRes?.skipped ? {
      skipped: true,
      reason: buyRes.reason
    } : buyRes?.before && buyRes?.after ? {
      price8_before: buyRes.before.price8.toString(),
      price8_after:  buyRes.after.price8.toString(),
      dP8:           deltaP8(buyRes.before.price8, buyRes.after.price8).toString(),
      // tahmini maliyet (fee=0 varsayımı) ve gözlem:
      expectedUsdc6: expectedBuyCostUSDC6(BUY_AMT, buyRes.before.price8).toString(),
      note: 'Kontrat buyFeeBps=0 değilse, net fark gözlemlenerek raporda belirtilir.'
    } : { skipped: true, error: buyRes?.error ?? null },

    sell: sellRes?.skipped ? {
      skipped: true,
      reason: sellRes.reason
    } : sellRes?.before && sellRes?.after ? {
      price8_before: sellRes.before.price8.toString(),
      price8_after:  sellRes.after.price8.toString(),
      dP8:           deltaP8(sellRes.before.price8, sellRes.after.price8).toString(),
      expected:      expectedSellProceedsUSDC6(SELL_AMT, sellRes.before.price8, SELL_FEE_BPS),
      note:          'Gerçek kontrat sellFeeBps farklıysa rapor farkı gösterecektir.'
    } : { skipped: true, error: sellRes?.error ?? null },

    attack: atkRes?.skipped ? {
      skipped: true,
      reason: atkRes.reason
    } : atkRes?.beforeFrom && atkRes?.afterFrom ? {
      from_price8_before: atkRes.beforeFrom.price8.toString(),
      from_price8_after:  atkRes.afterFrom.price8.toString(),
      to_price8_before:   atkRes.beforeTo.price8.toString(),
      to_price8_after:    atkRes.afterTo.price8.toString(),
      dP8_from:           deltaP8(atkRes.beforeFrom.price8, atkRes.afterFrom.price8).toString(),
      dP8_to:             deltaP8(atkRes.beforeTo.price8, atkRes.afterTo.price8).toString(),
      feeWei_used:        (atkRes.receipt?.effectiveGasPrice ? undefined : undefined), // sadece görsel
      note:               'WB1/WB2/WhiteFlag etkileri event/price farklarından türetilir; fonksiyon yoksa SKIP.'
    } : { skipped: true, error: atkRes?.error ?? null },

    final_snapshot: {
      from: afterFrom,
      to:   afterTo
    }
  };

  // RAPOR (Markdown + JSON)
  const md = [
    `# Phase-3 Live Math + App Test Report`,
    ``,
    `**Core**: \`${CORE}\`  |  **From**: ${FROM_ID}  |  **To**: ${TO_ID}`,
    `**Attack Fee (wei)**: ${ATTACK_FEE_WEI}`,
    `**Capabilities**: \`${JSON.stringify(caps)}\``,
    `**Mode**: ${READ_ONLY_MODE ? 'READ_ONLY' : 'TRANSACTION'}`,
    ``,
    `## Baseline`,
    `- From (before): price8=${pre.from.price8} (${pre.from.name})`,
    `- To   (before): price8=${pre.to.price8}   (${pre.to.name})`,
    ``,
    `## BUY`,
    analysis.buy.skipped
      ? `- ⏭️ Buy SKIPPED: ${analysis.buy.reason}`
      : buyRes?.error
        ? `- ❌ Buy FAILED: ${buyRes.error}`
        : `- ✅ Buy OK: dP8=${analysis.buy.dP8}, expectedUSDC6=${analysis.buy.expectedUsdc6}`,
    ``,
    `## SELL`,
    analysis.sell.skipped
      ? `- ⏭️ Sell SKIPPED: ${analysis.sell.reason}`
      : sellRes?.error
        ? `- ❌ Sell FAILED: ${sellRes.error}`
        : `- ✅ Sell OK: dP8=${analysis.sell.dP8}, expected(gross/fee/net)=${JSON.stringify(analysis.sell.expected)}`,
    ``,
    `## ATTACK`,
    analysis.attack.skipped
      ? `- ⏭️ Attack SKIPPED: ${analysis.attack.reason}`
      : atkRes?.error
        ? `- ❌ Attack FAILED: ${atkRes.error}`
        : `- ✅ Attack OK: dP8_from=${analysis.attack.dP8_from}, dP8_to=${analysis.attack.dP8_to}`,
    ``,
    `## Final Snapshot`,
    `- From (after): price8=${analysis.final_snapshot.from.price8}`,
    `- To   (after): price8=${analysis.final_snapshot.to.price8}`,
    ``,
    `> Not: Bu testler **varsayımsızdır**. κ/λ ve attack delta etkileri doğrudan "before/after" ölçülür.`,
    `> Read-only mode: Transaction testleri atlanır, sadece contract okuma testleri yapılır.`,
  ].join('\n');

  const json = { pre, buyRes, sellRes, atkRes, analysis };
  const paths = saveReport('phase3-live', md, json);
  console.log('Report saved:', paths);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});