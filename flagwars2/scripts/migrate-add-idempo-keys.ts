/**
 * Migration: Add idempoKey to existing claims
 * 
 * IMPORTANT: Run this BEFORE creating unique index!
 * 
 * Steps:
 * 1. Backfill idempoKey for all existing claims
 * 2. Identify and handle duplicates
 * 3. Then run: pnpm run init:claim-indexes
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { MongoClient, ObjectId } from 'mongodb'
import { generateIdempoKey } from '../lib/idempotency-key'

const MONGO_URI = process.env.MONGODB_URI || ''
const DB_NAME = 'flagwars'

async function migrate() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(DB_NAME)
    const collection = db.collection('offchain_claims')

    // Step 1: Count claims without idempoKey
    const missingCount = await collection.countDocuments({
      idempoKey: { $exists: false }
    })

    console.log(`\n📊 Found ${missingCount} claims without idempoKey`)

    if (missingCount === 0) {
      console.log('✅ All claims already have idempoKey!')
      return
    }

    // Step 2: Backfill idempoKey
    console.log('\n🔧 Backfilling idempoKey...')
    
    const claims = await collection.find({
      idempoKey: { $exists: false }
    }).toArray()

    let updated = 0
    const duplicates: any[] = []

    for (const claim of claims) {
      // Generate unique claimId (use MongoDB _id as fallback)
      const claimId = claim.reason || claim._id.toString()
      
      const idempoKey = generateIdempoKey(
        claim.wallet.toLowerCase(),
        claim.amount,
        claim.token.toLowerCase(),
        claimId
      )

      // Check if this key already exists
      const existing = await collection.findOne({ idempoKey })
      
      if (existing && existing._id.toString() !== claim._id.toString()) {
        duplicates.push({
          original: existing._id,
          duplicate: claim._id,
          idempoKey,
          wallet: claim.wallet
        })
        console.log(`  ⚠️  Duplicate found: ${claim._id} (same as ${existing._id})`)
        continue
      }

      // Update claim with idempoKey
      await collection.updateOne(
        { _id: claim._id },
        {
          $set: {
            idempoKey,
            attempts: claim.attempts ?? 0
          }
        }
      )

      updated++
      if (updated % 10 === 0) {
        console.log(`  Progress: ${updated}/${claims.length}`)
      }
    }

    console.log(`\n✅ Backfilled ${updated} claims`)

    // Step 3: Report duplicates
    if (duplicates.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.length} duplicate claims`)
      console.log('\nDuplicate Details:')
      duplicates.forEach((dup, i) => {
        console.log(`  ${i + 1}. Duplicate: ${dup.duplicate}`)
        console.log(`     Original: ${dup.original}`)
        console.log(`     Wallet: ${dup.wallet}`)
        console.log(`     IdempoKey: ${dup.idempoKey}`)
      })

      console.log('\n⚠️  ACTION REQUIRED:')
      console.log('  Review duplicates and decide:')
      console.log('  - Keep one, delete others (recommended)')
      console.log('  - Or merge if needed')
      console.log('')
      console.log('  Example delete command:')
      console.log(`  db.offchain_claims.deleteOne({ _id: ObjectId('...') })`)
      console.log('')
      console.log('  After resolving duplicates, run:')
      console.log('  pnpm run init:claim-indexes')
    } else {
      console.log('\n✅ No duplicates found!')
      console.log('✅ Safe to create unique index now')
      console.log('')
      console.log('  Run: pnpm run init:claim-indexes')
    }

  } catch (error) {
    console.error('❌ Migration error:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

migrate()

