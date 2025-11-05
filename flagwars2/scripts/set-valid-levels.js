// Set valid achievement levels
const { ethers } = require('hardhat')

async function main() {
  const CONTRACT_ADDRESS = '0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9'
  
  const AchievementsSBT = await ethers.getContractAt('AchievementsSBT', CONTRACT_ADDRESS)
  
  console.log('⚙️  Setting valid achievement levels...')
  
  const validLevels = {
    1: [1, 10, 100, 1000], // ATTACK_COUNT
    2: [1, 5, 15, 35], // MULTI_COUNTRY (fixed: 40 -> 35)
    3: [1, 10, 100, 1000], // REFERRAL_COUNT
    5: [5, 50, 250, 500], // FLAG_COUNT
  }
  
  for (const [category, levels] of Object.entries(validLevels)) {
    console.log(`  • Category ${category}: ${levels.join(', ')}`)
    const tx = await AchievementsSBT.setValidLevelsBatch(parseInt(category), levels, true)
    await tx.wait()
    console.log(`    ✓ Whitelisted`)
    
    // Wait 2 seconds between tx to avoid nonce issues
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  console.log('\n✅ All levels whitelisted!')
}

main().catch(console.error)

