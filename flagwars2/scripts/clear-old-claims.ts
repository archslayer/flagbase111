import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

async function clearClaims() {
  const client = new MongoClient(process.env.MONGODB_URI || '')
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db('flagwars')
    const result = await db.collection('offchain_claims').deleteMany({})
    
    console.log(`✅ Deleted ${result.deletedCount} old claims`)
  } finally {
    await client.close()
  }
}

clearClaims()

