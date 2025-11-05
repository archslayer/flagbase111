import { add } from './_report.mjs'
import { fetchRaw } from './_http.mjs'

export default async function run() {
  let ok = true
  const base = process.env.FULL_BASE_URL || 'http://localhost:3000'

  async function expectStatus(path, want, note) {
    const r = await fetchRaw(base + path)
    const pass = r.status === want
    if (!pass) ok = false
    add(`- \`${path}\`: got ${r.status}, want ${want} ${pass ? '✅' : '❌'} ${note ? `— ${note}` : ''}`)
    if (r.status >= 300 && r.status < 400) {
      add(`  - Location: ${r.headers.location || '(none)'}`)
    }
  }

  add('## Routes Guard (no auth cookie)\n')
  await expectStatus('/', 200, 'public')
  await expectStatus('/market', 200, 'public')
  await expectStatus('/profile', 307, 'should redirect to /?r=/profile')
  await expectStatus('/achievements', 307)
  await expectStatus('/quests', 307)
  await expectStatus('/attack', 307)
  add(ok ? '\n**Result:** ✅ PASS\n' : '\n**Result:** ❌ FAIL\n')
  return ok
}


