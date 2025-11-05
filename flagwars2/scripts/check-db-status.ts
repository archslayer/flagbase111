import dotenv from 'dotenv'
import { getDb } from '../lib/mongodb'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function checkDbStatus() {
  try {
    console.log('🔍 Checking database status...')
    
    const db = await getDb()
    
    // Check user_balances collection
    const balances = await db.collection('user_balances').find({}).toArray()
    console.log(`📊 user_balances collection: ${balances.length} records`)
    
    if (balances.length > 0) {
      console.log('📋 Sample records:')
      balances.slice(0, 3).forEach((record, i) => {
        console.log(`  ${i + 1}. User: ${record.userId}, Country: ${record.countryId}, Amount: ${record.amount || record.amountToken18}`)
      })
    }
    
    // Check other collections
    const collections = await db.listCollections().toArray()
    console.log('\n📁 Available collections:')
    collections.forEach(col => {
      console.log(`  - ${col.name}`)
    })
    
    // Check specific user
    const testUser = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
    const userBalances = await db.collection('user_balances').find({ userId: testUser }).toArray()
    console.log(`\n👤 Test user (${testUser}) balances: ${userBalances.length}`)
    
    if (userBalances.length > 0) {
      userBalances.forEach(balance => {
        console.log(`  - Country ${balance.countryId}: ${balance.amount || balance.amountToken18}`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error)
    process.exit(1)
  }
}

// Run the check
checkDbStatus().then(() => {
  console.log('✅ Check completed')
  process.exit(0)
}).catch((error) => {
  console.error('❌ Check failed:', error)
  process.exit(1)
})
