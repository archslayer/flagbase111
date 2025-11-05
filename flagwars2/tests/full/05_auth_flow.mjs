import { add } from './_report.mjs'
import { fetchRaw } from './_http.mjs'

export default async function run() {
  let ok = true
  const base = process.env.FULL_BASE_URL || 'http://localhost:3000'

  const r1 = await fetchRaw(base + '/api/auth/nonce')
  const nonceOk = r1.status === 200 && /[0-9a-f-]{8,}/i.test(r1.body)
  if (!nonceOk) ok = false
  add(`## Auth Flow\n- /api/auth/nonce: ${r1.status} ${nonceOk ? '✅' : '❌'}`)

  const r2 = await fetchRaw(base + '/api/me')
  const meUnauthorized = r2.status === 401
  if (!meUnauthorized) ok = false
  add(`- /api/me (no cookie): ${r2.status} ${meUnauthorized ? '✅' : '❌'}\n`)
  add(ok ? '**Result:** ✅ PASS (manual signing required in UI)\n' : '**Result:** ❌ FAIL\n')
  return ok
}


