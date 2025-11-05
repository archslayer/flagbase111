import { add } from './_report.mjs'
import { fetchRaw } from './_http.mjs'

export default async function run() {
  const base = process.env.FULL_BASE_URL || 'http://localhost:3000'
  let ok = true

  const body = JSON.stringify({ countryId: 90, amountToken18: "100000000000000000" })
  const h = { 'content-type': 'application/json' }

  const r1 = await fetchRaw(base + '/api/trade/buy', { method: 'POST', headers: h, body })
  const pass1 = r1.status === 200 || r1.status === 400
  if (!pass1) ok = false

  const r2 = await fetchRaw(base + '/api/trade/buy', { method: 'POST', headers: h, body })
  const cachedOrPending = [200, 409].includes(r2.status)
  if (!cachedOrPending) ok = false

  add('## Idempotency — /api/trade/buy\n')
  add(`- First call: ${r1.status}\n- Second (same body): ${r2.status} (expect 409 pending or 200 cached)\n`)
  add(ok ? '**Result:** ✅ PASS (behavior consistent)**\n' : '**Result:** ❌ FAIL\n')
  return ok
}


