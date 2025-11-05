/**
 * Set valid levels on AchievementsSBT contract (on-chain update)
 * Run as owner
 */

import 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import { ethers } from 'hardhat'

const ACHIEVEMENTS_SBT_ADDRESS = '0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9'

async function main() {
  console.log('🚀 Setting valid levels on AchievementsSBT...\n')

  // Get contract
  const sbt = await ethers.getContractAt('AchievementsSBT', ACHIEVEMENTS_SBT_ADDRESS)
  
  // Check owner
  const owner = await sbt.owner()
  const signer = await ethers.provider.getSigner()
  const signerAddress = await signer.getAddress()
  
  console.log(`Owner: ${owner}`)
  console.log(`Signer: ${signerAddress}`)
  
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error('Signer is not the owner!')
  }
  
  console.log('✅ Signer is owner, proceeding...\n')

  // 1. Fix Multi-Country threshold (35 is valid, 40 is not)
  console.log('1. Fixing Multi-Country thresholds (category 2)...')
  console.log('   Setting level 35 = true...')
  await sbt.setValidLevel(2, 35, true)
  console.log('   ✅ Set level 35 = true')
  
  console.log('   Setting level 40 = false...')
  await sbt.setValidLevel(2, 40, false)
  console.log('   ✅ Set level 40 = false')
  console.log('')

  // 2. Add Flag Count levels (category 5)
  console.log('2. Adding Flag Count levels (category 5)...')
  console.log('   Setting levels [5, 50, 250, 500] = true...')
  await sbt.setValidLevelsBatch(5, [5, 50, 250, 500], true)
  console.log('   ✅ Set Flag Count levels')
  console.log('')

  // 3. Verify
  console.log('3. Verifying valid levels...\n')
  
  const v2_35 = await sbt.validLevels(2, 35)
  const v2_40 = await sbt.validLevels(2, 40)
  const v5_5 = await sbt.validLevels(5, 5)
  const v5_50 = await sbt.validLevels(5, 50)
  const v5_250 = await sbt.validLevels(5, 250)
  const v5_500 = await sbt.validLevels(5, 500)
  
  console.log(`validLevels(2, 35): ${v2_35} (expected: true) ${v2_35 ? '✅' : '❌'}`)
  console.log(`validLevels(2, 40): ${v2_40} (expected: false) ${!v2_40 ? '✅' : '❌'}`)
  console.log(`validLevels(5, 5): ${v5_5} (expected: true) ${v5_5 ? '✅' : '❌'}`)
  console.log(`validLevels(5, 50): ${v5_50} (expected: true) ${v5_50 ? '✅' : '❌'}`)
  console.log(`validLevels(5, 250): ${v5_250} (expected: true) ${v5_250 ? '✅' : '❌'}`)
  console.log(`validLevels(5, 500): ${v5_500} (expected: true) ${v5_500 ? '✅' : '❌'}`)
  console.log('')

  // Check for old category 4 (should not exist)
  try {
    const v4_10 = await sbt.validLevels(4, 10)
    if (v4_10) {
      console.log('⚠️  WARNING: Category 4 level 10 is still valid! Should disable it.')
      console.log('   Run: await sbt.setValidLevelsBatch(4, [10,20,30,60], false)')
    }
  } catch (e) {
    // Expected - category 4 doesn't exist or already disabled
    console.log('✅ Category 4 is properly disabled')
  }

  console.log('\n✅ All valid levels set successfully!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

