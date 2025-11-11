import { add } from './_report.mjs'
import { fetchRaw } from './_http.mjs'

export default async function run() {
  const base = process.env.FULL_BASE_URL || 'http://localhost:3000'
  const r = await fetchRaw(base + '/api/sse/price?ids=90,44', { method: 'GET', headers: { accept: 'text/event-stream' }, timeout: 4000 })
  if (r.status === 404) {
    add('## SSE\n**Result:** ⏭️ SKIP (no SSE route)\n')
    return true
  }
  const ok = r.status === 200 && String(r.headers['content-type'] || '').includes('text/event-stream')
  add('## SSE\n')
  add(`- Status: ${r.status}\n- Content-Type: ${r.headers['content-type']}\n`)
  add(ok ? '**Result:** ✅ PASS\n' : '**Result:** ❌ FAIL\n')
  return ok
}


