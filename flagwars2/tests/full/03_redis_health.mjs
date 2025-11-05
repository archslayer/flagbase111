import { loadEnv } from './_env.mjs'
import { add } from './_report.mjs'

export default async function run() {
  const env = loadEnv()
  if (!env.USE_REDIS) {
    add('## Redis Health\n**Result:** ⏭️ SKIP (USE_REDIS=false)\n')
    return true
  }
  try {
    const { createClient } = await import('redis')
    const client = createClient({ url: env.REDIS_URL })
    await client.connect()
    const pong = await client.ping()
    await client.quit()
    add(`## Redis Health\n- Ping: ${pong}\n\n**Result:** ✅ PASS\n`)
    return true
  } catch (e) {
    add(`## Redis Health\n**Error:** ${e?.message || e}\n\n**Result:** ❌ FAIL\n`)
    return false
  }
}


