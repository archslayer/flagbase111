import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'

const WALLET = '0xc32e33f743cf7f95d90d1392771632ff1640de16'

async function checkClaims() {
  const client = new MongoClient(process.env.MONGODB_URI || '')
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db('flagwars')
    const claims = await db.collection('offchain_claims')
      .find({ wallet: WALLET })
      .sort({ claimedAt: -1 })
      .limit(5)
      .toArray()
    
    console.log('')
    console.log('=== LATEST CLAIMS ===')
    console.log(`Wallet: ${WALLET}`)
    console.log(`Total claims found: ${claims.length}`)
    console.log('')
    
    claims.forEach((c: any, i: number) => {
      const amount = BigInt(c.amount)
      const usdc = (amount / 1000000n).toString()
      const cents = (amount % 1000000n).toString().padStart(6, '0').slice(0, 2)
      
      console.log(`Claim ${i + 1}:`)
      console.log(`  Amount: ${usdc}.${cents} USDC`)
      console.log(`  Status: ${c.status}`)
      console.log(`  Reason: ${c.reason}`)
      console.log(`  Date: ${c.claimedAt.toISOString()}`)
      if (c.txHash) console.log(`  TX: ${c.txHash}`)
      console.log('')
    })
    
  } finally {
    await client.close()
  }
}

checkClaims()

