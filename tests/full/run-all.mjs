import { add, save } from './_report.mjs'

const steps = [
  ['ENV & Sanity', () => import('./01_env_sanity.mjs').then(m => m.default())],
  ['DB Health', () => import('./02_db_health.mjs').then(m => m.default())],
  ['Redis Health (optional)', () => import('./03_redis_health.mjs').then(m => m.default())],
  ['Routes Guard', () => import('./04_routes_guard.mjs').then(m => m.default())],
  ['Auth Flow', () => import('./05_auth_flow.mjs').then(m => m.default())],
  ['Contract Read Health', () => import('./06_contract_read.mjs').then(m => m.default())],
  ['Idempotency BUY', () => import('./07_idempotency_buy_sell.mjs').then(m => m.default())],
  ['SSE (optional)', () => import('./08_sse_smoke.mjs').then(m => m.default())]
]

let allOk = true
for (const [name, fn] of steps) {
  try {
    const ok = await fn()
    if (!ok) allOk = false
  } catch (e) {
    allOk = false
    add(`\n## ${name}\n**Error (unhandled):** ${e?.message || e}\n\n**Result:** ❌ FAIL\n`)
  }
}

const path = save()
console.log(`\n✅ Report written to: ${path}\n`)
process.exitCode = allOk ? 0 : 1


