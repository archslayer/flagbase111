import { loadEnv } from './_env.mjs'
import { add } from './_report.mjs'
import { MongoClient } from 'mongodb'

export default async function run() {
  const env = loadEnv()
  let ok = true
  let note = ''
  if (!env.DATABASE_URL) {
    add('## DB Health\n**Result:** ⏭️ SKIP (DATABASE_URL missing)\n')
    return true
  }
  try {
    const client = new MongoClient(env.DATABASE_URL, { serverSelectionTimeoutMS: 8000, tls: true })
    await client.connect()
    await client.db().command({ ping: 1 })
    const colNames = (await client.db().listCollections().toArray()).map(c => c.name).slice(0, 10)
    await client.close()
    add(`## DB Health\n- Ping: ✅\n- Collections (first 10): ${colNames.join(', ') || '(none)'}\n\n**Result:** ✅ PASS\n`)
  } catch (e) {
    ok = false
    note = e?.message ?? String(e)
    add(`## DB Health\n**Error:** ${note}\n\n**Result:** ❌ FAIL\n`)
  }
  return ok
}


