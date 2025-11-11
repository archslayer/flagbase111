import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.MONGODB_URI || ''
const wallet = '0xc32e33f743cf7f95d90d1392771632ff1640de16'

async function main() {
  const c = new MongoClient(MONGO_URI)
  await c.connect()
  const db = c.db('flagwars')
  
  const r = await db.collection('offchain_claims').deleteMany({ wallet })
  console.log(`✅ Deleted ${r.deletedCount} test claims for ${wallet}`)
  
  await c.close()
}

main()

