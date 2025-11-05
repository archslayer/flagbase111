const { CORE, ATTACK_FEE_WEI } = require('./env')
const { getCaps, readCountry } = require('./read')
const { doBuy, doSell, doAttack } = require('./tx')
const { deltaP8, token18ToUsdc6 } = require('./units')
const { saveReport } = require('./reporter')

const PK = process.env.TEST_WALLET_PK
const FROM_ID = Number(process.env.TEST_FROM_ID || '90')
const TO_ID   = Number(process.env.TEST_TO_ID   || '44')
const AMT = 10n**16n // 0.01 TOKEN18
const SELL_FEE_BPS = Number(process.env.SELL_FEE_BPS || '500')
const READ_ONLY_MODE = process.env.READ_ONLY_MODE === 'true' || !PK

if (!READ_ONLY_MODE && !PK) { console.error('Set TEST_WALLET_PK or READ_ONLY_MODE=true'); process.exit(1) }

async function run() {
  const caps = await getCaps()
  if (caps.paused === true) throw new Error('Contract paused; unpause required.')

  const preFrom = await readCountry(FROM_ID)
  const preTo   = await readCountry(TO_ID)

  let buy=null, sell=null, atk=null
  if (READ_ONLY_MODE) {
    buy = { skipped: true, reason: 'READ_ONLY_MODE - RPC does not support wallet_sendTransaction' }
    sell = { skipped: true, reason: 'READ_ONLY_MODE - RPC does not support wallet_sendTransaction' }
    atk = { skipped: true, reason: 'READ_ONLY_MODE - RPC does not support wallet_sendTransaction' }
  } else {
    try { buy = await doBuy(PK, FROM_ID, AMT) } catch(e){ buy = { error: e?.message || String(e) } }
    try { sell= await doSell(PK, FROM_ID, AMT) } catch(e){ sell= { error: e?.message || String(e) } }
    try { atk = await doAttack(PK, FROM_ID, TO_ID, AMT) } catch(e){ atk = { error: e?.message || String(e) } }
  }

  const finalFrom = await readCountry(FROM_ID)
  const finalTo   = await readCountry(TO_ID)

  const md = [
    `# Phase-4 Live TX Math + App Report`,
    ``,
    `Core: \`${CORE}\` | From=${FROM_ID} | To=${TO_ID}`,
    `Caps: ${JSON.stringify(caps)} | AttackFeeWei=${ATTACK_FEE_WEI}`,
    ``,
    `## Baseline`,
    `From(before) price8=${preFrom.price8} (${preFrom.name})`,
    `To(before)   price8=${preTo.price8}   (${preTo.name})`,
    ``,
    `## BUY`,
    buy?.skipped ? `- ⏭️ SKIPPED: ${buy.reason}` :
      buy?.error ? `- ❌ ${buy.error}` :
        `- ✅ dP8=${deltaP8(buy.before.price8,buy.after.price8)} | estUSDC6=${token18ToUsdc6(AMT,buy.before.price8)}`,
    ``,
    `## SELL`,
    sell?.skipped ? `- ⏭️ SKIPPED: ${sell.reason}` :
      sell?.error ? `- ❌ ${sell.error}` :
        `- ✅ dP8=${deltaP8(sell.before.price8,sell.after.price8)} | estGrossUSDC6=${token18ToUsdc6(AMT,sell.before.price8)} | feeBps=${SELL_FEE_BPS}`,
    ``,
    `## ATTACK`,
    atk?.skipped ? `- ⏭️ SKIPPED: ${atk.reason}` :
      atk?.error ? `- ❌ ${atk.error}` :
        `- ✅ dP8_from=${deltaP8(atk.beforeFrom.price8,atk.afterFrom.price8)} | dP8_to=${deltaP8(atk.beforeTo.price8,atk.afterTo.price8)}`,
    ``,
    `## Final`,
    `From(after) price8=${finalFrom.price8}`,
    `To(after)   price8=${finalTo.price8}`,
  ].join('\n')

  const json = { caps, pre:{preFrom,preTo}, buy, sell, atk, final:{finalFrom,finalTo} }
  const paths = saveReport('phase4-live', md, json)
  console.log('Report saved:', paths)
}
run().catch((e)=>{ console.error(e); process.exit(1) })
