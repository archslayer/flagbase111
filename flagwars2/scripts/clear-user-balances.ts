import dotenv from 'dotenv'
import { getDb } from '../lib/mongodb'

// Load environment variables
dotenv.config({ path: '.env.local' })

async function clearUserBalances() {
  try {
    console.log('🗑️  Clearing user balances from database...')
    
    const db = await getDb()
    
    // Clear user balances collection
    const result = await db.collection('user_balances').deleteMany({})
    
    console.log(`✅ Cleared ${result.deletedCount} user balance records`)
    
    // Also clear any other related collections if they exist
    const collections = await db.listCollections().toArray()
    const balanceCollections = collections.filter(col => 
      col.name.includes('balance') || 
      col.name.includes('inventory') ||
      col.name.includes('portfolio')
    )
    
    for (const col of balanceCollections) {
      const deleteResult = await db.collection(col.name).deleteMany({})
      console.log(`✅ Cleared ${deleteResult.deletedCount} records from ${col.name}`)
    }
    
    console.log('🎉 User balances cleared successfully!')
    console.log('💡 Users will now see fresh data from the new contract')
    
  } catch (error) {
    console.error('❌ Error clearing user balances:', error)
    process.exit(1)
  }
}

// Run the cleanup
clearUserBalances().then(() => {
  console.log('✅ Script completed')
  process.exit(0)
}).catch((error) => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
