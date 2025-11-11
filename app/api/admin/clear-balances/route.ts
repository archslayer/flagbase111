import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(request: NextRequest) {
  try {
    // Basic admin check (you can enhance this)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🗑️  Admin: Clearing user balances from database...')
    
    const db = await getDb()
    
    // Clear user balances collection
    const result = await db.collection('user_balances').deleteMany({})
    
    console.log(`✅ Admin: Cleared ${result.deletedCount} user balance records`)
    
    // Also clear any other related collections if they exist
    const collections = await db.listCollections().toArray()
    const balanceCollections = collections.filter(col => 
      col.name.includes('balance') || 
      col.name.includes('inventory') ||
      col.name.includes('portfolio')
    )
    
    let totalCleared = result.deletedCount
    
    for (const col of balanceCollections) {
      const deleteResult = await db.collection(col.name).deleteMany({})
      console.log(`✅ Admin: Cleared ${deleteResult.deletedCount} records from ${col.name}`)
      totalCleared += deleteResult.deletedCount
    }
    
    return NextResponse.json({
      success: true,
      message: 'User balances cleared successfully',
      totalCleared
    })
    
  } catch (error: any) {
    console.error('❌ Admin: Error clearing user balances:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
