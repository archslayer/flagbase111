/**
 * Deploy AchievementsSBT Contract
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-achievements-sbt.ts --network baseSepolia
 */

const { ethers } = require('hardhat')
const { privateKeyToAccount } = require('viem/accounts')

async function main() {
  console.log('🚀 Deploying AchievementsSBT...\n')

  // Get signer address from private key
  const ACHV_SIGNER_PK = process.env.ACHV_SIGNER_PRIVATE_KEY
  if (!ACHV_SIGNER_PK) {
    throw new Error('ACHV_SIGNER_PRIVATE_KEY not set in environment')
  }
  const account = privateKeyToAccount(ACHV_SIGNER_PK)
  const SIGNER_ADDRESS = account.address

  // Get deployment parameters
  const USDC_ADDRESS = process.env.USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  const REVENUE_ADDRESS = process.env.REVENUE_ADDRESS || '0x2C1cfF98eF5f46d4D4E7e58F845Dd9D2F9d20b10'
  const BASE_URI = process.env.ACHV_BASE_URI || 'https://assets.flagwars.xyz/achievements'

  console.log('📋 Deployment Parameters:')
  console.log(`  • Signer:   ${SIGNER_ADDRESS}`)
  console.log(`  • USDC:     ${USDC_ADDRESS}`)
  console.log(`  • Revenue:  ${REVENUE_ADDRESS}`)
  console.log(`  • Base URI: ${BASE_URI}\n`)

  // Deploy contract
  const AchievementsSBT = await ethers.getContractFactory('AchievementsSBT')
  const contract = await AchievementsSBT.deploy(
    SIGNER_ADDRESS,
    USDC_ADDRESS,
    REVENUE_ADDRESS,
    BASE_URI
  )

  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log(`✅ AchievementsSBT deployed to: ${address}\n`)

  // ════════════════════════════════════════════════════════════════════════════════
  // SET VALID LEVELS (Whitelist)
  // ════════════════════════════════════════════════════════════════════════════════

  console.log('⚙️  Setting valid achievement levels...')

  const validLevels = {
    1: [1, 10, 100, 1000], // ATTACK_COUNT
    2: [1, 5, 15, 35], // MULTI_COUNTRY (fixed: 40 -> 35)
    3: [1, 10, 100, 1000], // REFERRAL_COUNT
    5: [5, 50, 250, 500], // FLAG_COUNT
  }

  for (const [category, levels] of Object.entries(validLevels)) {
    console.log(`  • Category ${category}: ${levels.join(', ')}`)
    const tx = await contract.setValidLevelsBatch(parseInt(category), levels, true)
    await tx.wait()
    console.log(`    ✓ Whitelisted`)
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // VERIFY DEPLOYMENT
  // ════════════════════════════════════════════════════════════════════════════════

  console.log('\n🔍 Verifying deployment...')

  const signer = await contract.signer()
  const payToken = await contract.payToken()
  const revenue = await contract.revenue()
  const priceUSDC6 = await contract.PRICE_USDC6()

  console.log(`  • Signer:      ${signer}`)
  console.log(`  • Pay Token:   ${payToken}`)
  console.log(`  • Revenue:     ${revenue}`)
  console.log(`  • Mint Price:  ${ethers.formatUnits(priceUSDC6, 6)} USDC`)

  // Check a valid level
  const isValid = await contract.validLevels(1, 10) // Attack Count - 10
  console.log(`  • Valid Level [1][10]: ${isValid}`)

  // ════════════════════════════════════════════════════════════════════════════════
  // SAVE TO .ENV
  // ════════════════════════════════════════════════════════════════════════════════

  console.log('\n📝 Add this to your .env.local:')
  console.log(`\nACHIEVEMENTS_SBT_ADDRESS=${address}`)
  console.log(`NEXT_PUBLIC_ACHIEVEMENTS_SBT_ADDRESS=${address}\n`)

  console.log('✅ Deployment complete!\n')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

module.exports = {}

