/**
 * Force delete Category 4 from MongoDB (direct delete)
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ MongoDB connected\n')

    const db = client.db()
    const defs = db.collection('achv_defs')

    // Find and delete category 4
    const result = await defs.deleteMany({
      $or: [
        { category: 4 },
        { key: 'CONSECUTIVE_DAYS' },
        { title: { $regex: /consecutive/i } }
      ]
    })

    console.log(`🗑️  Deleted ${result.deletedCount} Consecutive Days definitions`)

    // Verify
    const remaining = await defs.find({ enabled: true }).toArray()
    console.log(`\n📊 Remaining definitions: ${remaining.length}`)
    for (const def of remaining) {
      console.log(`  Category ${def.category}: ${def.title}`)
    }

    if (result.deletedCount > 0) {
      console.log('\n✅ Consecutive Days removed from database!')
    } else {
      console.log('\n✅ No Consecutive Days found (already clean)')
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

