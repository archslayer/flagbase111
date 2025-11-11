import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env.local FIRST before any other imports
config({ path: resolve(process.cwd(), '.env.local') })

import { publicClient, getTreasuryAddress } from '../lib/viem/clients'

async function testClients() {
  try {
    console.log('Testing viem clients...')
    
    const block = await publicClient.getBlockNumber()
    console.log('✅ Block:', block)
    
    const treasury = getTreasuryAddress()
    console.log('✅ Treasury:', treasury)
    
    console.log('\n✅ Viem clients working!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testClients()

