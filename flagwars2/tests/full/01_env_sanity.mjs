import { loadEnv } from './_env.mjs'
import { add } from './_report.mjs'

export default async function run() {
  const env = loadEnv()
  let ok = true
  const rows = []

  function check(name, cond, detail='') {
    rows.push(`| ${name} | ${cond ? '✅' : '❌'} | ${detail} |`)
    if (!cond) ok = false
  }

  check('DATABASE_URL', !!env.DATABASE_URL, env.DATABASE_URL ? 'present' : 'missing')
  check('JWT_SECRET', !!env.JWT_SECRET, env.JWT_SECRET ? 'present' : 'missing')
  check('NEXT_PUBLIC_CORE_ADDRESS', /^0x[a-fA-F0-9]{40}$/.test(env.NEXT_PUBLIC_CORE_ADDRESS || ''), env.NEXT_PUBLIC_CORE_ADDRESS || '')
  check('NEXT_PUBLIC_RPC_BASE_SEPOLIA', !!env.NEXT_PUBLIC_RPC_BASE_SEPOLIA, env.NEXT_PUBLIC_RPC_BASE_SEPOLIA)
  if (env.USE_REDIS) check('REDIS_URL', !!env.REDIS_URL, env.REDIS_URL || 'missing (required if USE_REDIS=true)')

  add('## ENV & Sanity\n')
  add('| Item | Status | Detail |')
  add('|---|---|---|')
  rows.forEach(r => add(r))
  add(ok ? '\n**Result:** ✅ PASS\n' : '\n**Result:** ❌ FAIL\n')

  return ok
}


