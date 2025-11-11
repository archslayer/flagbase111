/**
 * Check MongoDB achievement definitions for Consecutive Days (category 4)
 * Direct MongoDB check without server-only imports
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI or DATABASE_URL not found in .env.local')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ MongoDB connected\n')

    const db = client.db()
    const defs = db.collection('achv_defs')

    console.log('🔍 Checking achievement definitions...\n')

    const allDefs = await defs.find({}).toArray()

    console.log(`📊 Total definitions: ${allDefs.length}\n`)

    let foundConsecutive = false
    let foundFlagCount = false

    for (const def of allDefs) {
      console.log(`Category ${def.category}: ${def.title}`)
      console.log(`  Key: ${def.key}`)
      console.log(`  Levels: ${def.levels?.join(', ') || 'N/A'}`)
      console.log(`  Enabled: ${def.enabled}`)
      console.log('')

      if (def.category === 4 || def.key === 'CONSECUTIVE_DAYS' || def.title?.toLowerCase().includes('consecutive')) {
        foundConsecutive = true
        console.log(`  ⚠️  ⚠️  ⚠️  FOUND CONSECUTIVE DAYS!`)
      }

      if (def.category === 5 || def.key === 'FLAG_COUNT') {
        foundFlagCount = true
        console.log(`  ✅ Flag Count found`)
      }
    }

    console.log('\n' + '='.repeat(50))
    if (foundConsecutive) {
      console.log('\n❌ PROBLEM: Category 4 (Consecutive Days) still exists in DB!')
      console.log('   Solution: Delete it and re-run init-achievements.ts')
    } else {
      console.log('\n✅ No Consecutive Days found')
    }

    if (!foundFlagCount) {
      console.log('\n⚠️  Category 5 (Flag Count) not found in DB!')
      console.log('   Solution: Run scripts/init-achievements.ts')
    } else {
      console.log('\n✅ Flag Count found')
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

