/**
 * Check Claim Status and Process
 * 
 * Checks if a claim exists for the wallet and shows its status
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
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB\n')

    const db = client.db(DB_NAME)
    const checksummed = getAddress(WALLET)
    const walletLower = checksummed.toLowerCase()

    // Check offchain_claims
    console.log('🔍 Checking offchain_claims...')
    const claims = await db.collection('offchain_claims')
      .find({ wallet: walletLower })
      .sort({ claimedAt: -1 })
      .limit(5)
      .toArray()

    if (claims.length === 0) {
      console.log('   ℹ️  No claims found')
    } else {
      console.log(`   Found ${claims.length} claim(s):\n`)
      claims.forEach((claim, i) => {
        const amount = (Number(claim.amount) / 1_000_000).toFixed(2)
        console.log(`   ${i + 1}. Amount: ${amount} USDC`)
        console.log(`      Status: ${claim.status}`)
        console.log(`      Reason: ${claim.reason}`)
        console.log(`      ClaimId: ${claim.claimId || 'N/A'}`)
        console.log(`      Date: ${claim.claimedAt}`)
        console.log(`      TxHash: ${claim.txHash || 'N/A'}`)
        console.log(`      Error: ${claim.error || 'N/A'}`)
        console.log(`      Attempts: ${claim.attempts || 0}`)
        if (claim.processedAt) {
          console.log(`      ProcessedAt: ${claim.processedAt}`)
        }
        console.log('')
      })
    }

    // Check daily_payouts
    console.log('🔍 Checking daily_payouts...')
    const today = new Date()
    const dayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
    
    const payout = await db.collection('daily_payouts')
      .findOne({ day: dayStr, wallet: walletLower })

    if (!payout) {
      console.log('   ℹ️  No payouts today')
    } else {
      const amount = (Number(payout.amountUSDC6) / 1_000_000).toFixed(2)
      console.log(`   Amount Today: ${amount} USDC`)
      console.log(`   Hit Cap: ${payout.hitCap}`)
      console.log(`   Last Updated: ${payout.lastUpdatedAt}`)
    }

    console.log('\n📋 Summary:')
    const pending = claims.filter(c => c.status === 'pending').length
    const processing = claims.filter(c => c.status === 'processing').length
    const completed = claims.filter(c => c.status === 'completed').length
    const failed = claims.filter(c => c.status === 'failed').length

    console.log(`   Pending: ${pending}`)
    console.log(`   Processing: ${processing}`)
    console.log(`   Completed: ${completed}`)
    console.log(`   Failed: ${failed}`)

    if (pending > 0) {
      console.log('\n⚠️  You have pending claims!')
      console.log('   Start the worker to process them:')
      console.log('   pnpm run worker:claims')
    }

    if (completed > 0) {
      console.log('\n✅ You have completed claims!')
      console.log('   Check your wallet for USDC')
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

