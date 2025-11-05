/**
 * Admin Helper: Daily Payout Queries
 * 
 * Quick scripts for monitoring daily payouts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient } from 'mongodb'
import { dayStrUTC } from '../lib/daily-payout-tracker'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'
const USDC_ADDRESS = (process.env.CLAIM_USDC_ADDRESS || '').toLowerCase()

async function main() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const collection = db.collection('daily_payouts')

    const dayStr = dayStrUTC()
    console.log(`\n📊 Daily Payout Report: ${dayStr}`)
    console.log('='.repeat(60))

    // 1. Users who hit cap today
    console.log('\n1️⃣  Users at Daily Cap:')
    const atCap = await collection
      .find({ day: dayStr, hitCap: true })
      .project({ _id: 0, wallet: 1, amountUSDC6: 1 })
      .sort({ amountUSDC6: -1 })
      .toArray()

    if (atCap.length === 0) {
      console.log('   ✅ No users at cap')
    } else {
      atCap.forEach((u, i) => {
        const usdcFormatted = (Number(u.amountUSDC6) / 1_000_000).toFixed(2)
        console.log(`   ${i + 1}. ${u.wallet.slice(0, 10)}... - ${usdcFormatted} USDC`)
      })
    }

    // 2. Top 10 users by payout
    console.log('\n2️⃣  Top 10 Payouts Today:')
    const top10 = await collection
      .find({ day: dayStr, token: USDC_ADDRESS })
      .sort({ amountUSDC6: -1 })
      .limit(10)
      .project({ _id: 0, wallet: 1, amountUSDC6: 1, hitCap: 1 })
      .toArray()

    if (top10.length === 0) {
      console.log('   ℹ️  No payouts today')
    } else {
      top10.forEach((u, i) => {
        const usdcFormatted = (Number(u.amountUSDC6) / 1_000_000).toFixed(2)
        const capIcon = u.hitCap ? '⚠️ ' : ''
        console.log(`   ${i + 1}. ${capIcon}${u.wallet.slice(0, 10)}... - ${usdcFormatted} USDC`)
      })
    }

    // 3. Total summary
    console.log('\n3️⃣  Total Summary:')
    const [summary] = await collection.aggregate([
      { $match: { day: dayStr, token: USDC_ADDRESS } },
      {
        $group: {
          _id: null,
          totalUSDC6: { $sum: '$amountUSDC6' },
          totalUsers: { $sum: 1 },
          usersAtCap: { $sum: { $cond: ['$hitCap', 1, 0] } }
        }
      }
    ]).toArray()

    if (summary) {
      const totalFormatted = (Number(summary.totalUSDC6) / 1_000_000).toFixed(2)
      console.log(`   Total Paid: ${totalFormatted} USDC`)
      console.log(`   Total Users: ${summary.totalUsers}`)
      console.log(`   Users at Cap: ${summary.usersAtCap}`)
      
      const dailyCapFormatted = (Number(process.env.CLAIM_DAILY_CAP_USDC6 || '1000000000') / 1_000_000).toFixed(2)
      const percentUsed = ((Number(summary.totalUSDC6) / Number(process.env.CLAIM_DAILY_CAP_USDC6 || '1000000000')) * 100).toFixed(1)
      console.log(`   Per-User Cap: ${dailyCapFormatted} USDC`)
      console.log(`   Cap Usage: ${percentUsed}%`)
    } else {
      console.log('   ℹ️  No data for today')
    }

    // 4. User history example (if wallet provided)
    const testWallet = process.argv[2]
    if (testWallet) {
      console.log(`\n4️⃣  History for ${testWallet.slice(0, 10)}...`)
      const history = await collection
        .find({ wallet: testWallet.toLowerCase(), token: USDC_ADDRESS })
        .project({ day: 1, amountUSDC6: 1, hitCap: 1, _id: 0 })
        .sort({ day: -1 })
        .limit(30)
        .toArray()

      if (history.length === 0) {
        console.log('   ℹ️  No payout history')
      } else {
        history.forEach(h => {
          const usdcFormatted = (Number(h.amountUSDC6) / 1_000_000).toFixed(2)
          const capIcon = h.hitCap ? '⚠️ ' : ''
          console.log(`   ${h.day}: ${capIcon}${usdcFormatted} USDC`)
        })
      }
    }

    console.log('')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

