/**
 * Reset Daily Cap Test Data
 * 
 * Clears today's daily_payouts and pending offchain_claims
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'
import { dayStrUTC } from '../lib/daily-payout-tracker'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    const db = client.db(DB_NAME)

    const dayStr = dayStrUTC()
    console.log(`\n🧹 Resetting Daily Cap Test Data for ${dayStr}...`)
    console.log('='.repeat(60))

    // Delete today's daily_payouts
    const payoutsResult = await db.collection('daily_payouts').deleteMany({ day: dayStr })
    console.log(`✅ Deleted ${payoutsResult.deletedCount} daily_payout records`)

    // Delete all pending claims
    const claimsResult = await db.collection('offchain_claims').deleteMany({ 
      status: 'pending'
    })
    console.log(`✅ Deleted ${claimsResult.deletedCount} pending claims`)

    // Delete failed claims
    const failedResult = await db.collection('offchain_claims').deleteMany({ 
      status: 'failed'
    })
    console.log(`✅ Deleted ${failedResult.deletedCount} failed claims`)

    console.log('\n✅ Reset complete! Ready for testing.')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

