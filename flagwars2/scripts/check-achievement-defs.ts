/**
 * Check MongoDB achievement definitions for Consecutive Days (category 4)
 */

import dotenv from 'dotenv'
import { getDb } from '../lib/mongodb'
import { ACHV_COLLECTIONS } from '../lib/schemas/achievements'

dotenv.config({ path: '.env.local' })

async function main() {
  try {
    const db = await getDb()
    const defs = db.collection(ACHV_COLLECTIONS.DEFS)

    console.log('🔍 Checking achievement definitions in MongoDB...\n')

    const allDefs = await defs.find({}).toArray()

    console.log(`📊 Total definitions: ${allDefs.length}\n`)

    let foundConsecutive = false

    for (const def of allDefs) {
      console.log(`Category ${def.category}: ${def.title} (key: ${def.key})`)
      console.log(`  Levels: ${def.levels.join(', ')}`)
      console.log(`  Enabled: ${def.enabled}`)
      console.log('')

      if (def.category === 4 || def.key === 'CONSECUTIVE_DAYS' || def.title.includes('Consecutive')) {
        foundConsecutive = true
        console.log(`  ⚠️  FOUND CONSECUTIVE DAYS DEFINITION!`)
        console.log(`  🗑️  This should be deleted!\n`)
      }
    }

    if (foundConsecutive) {
      console.log('\n❌ PROBLEM: Category 4 (Consecutive Days) definition still exists in DB!')
      console.log('   Action: Run scripts/init-achievements.ts to clean and re-seed')
    } else {
      console.log('\n✅ No Consecutive Days definitions found')
    }

    // Check category 5 (Flag Count)
    const flagCountDef = allDefs.find(d => d.category === 5)
    if (!flagCountDef) {
      console.log('\n⚠️  Category 5 (Flag Count) not found in DB!')
      console.log('   Action: Run scripts/init-achievements.ts to seed it')
    } else {
      console.log('\n✅ Category 5 (Flag Count) found')
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

main()

