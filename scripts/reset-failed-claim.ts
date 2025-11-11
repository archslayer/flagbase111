/**
 * Reset Failed Claim to Pending
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'
import { getAddress } from 'viem'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'
const WALLET = process.argv[2] || '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'

async function main() {
  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    const db = client.db(DB_NAME)
    
    const walletLower = getAddress(WALLET).toLowerCase()

    // Reset processing/failed claims to pending
    const result = await db.collection('offchain_claims').updateMany(
      { 
        wallet: walletLower,
        status: { $in: ['processing', 'failed'] }
      },
      {
        $set: {
          status: 'pending',
          attempts: 0,
          error: null,
          txHash: null,
          processedAt: null
        },
        $unset: {
          leaseAt: ''
        }
      }
    )

    console.log(`✅ Reset ${result.modifiedCount} claim(s) to pending`)

  } finally {
    await client.close()
  }
}

main()

