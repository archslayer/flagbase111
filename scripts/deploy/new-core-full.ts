import { config } from 'dotenv'
config({ path: '.env.local' })

import hre from 'hardhat'
const { ethers } = hre

async function main() {
  console.log('=== DEPLOYING NEW CORE SYSTEM ===\n')

  const [deployer] = await ethers.getSigners()
  const treasury = new ethers.Wallet(
    process.env.TREASURY_PRIVATE_KEY!,
    ethers.provider
  )

  console.log('Deployer:', deployer.address)
  console.log('Treasury:', treasury.address)
  console.log('')

  const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS
  if (!USDC_ADDRESS) throw new Error('USDC_ADDRESS not set')
  console.log('USDC:', USDC_ADDRESS)
  console.log('')

  // 1) Deploy Core
  console.log('1) Deploying Core...')
  const Core = await ethers.getContractFactory('Core')
  const core = await Core.deploy(USDC_ADDRESS, treasury.address)
  await core.waitForDeployment()
  const CORE_ADDRESS = await core.getAddress()
  console.log('   Core deployed:', CORE_ADDRESS)

  // 2) Deploy FlagTokens (CORE_ADDRESS will be known after Core deployment)
  console.log('\n2) Deploying FlagTokens...')
  const FlagToken = await ethers.getContractFactory('FlagToken')
  
  const tokens = [
    { id: 90, name: 'Turkey', symbol: 'TR' },
    { id: 44, name: 'United Kingdom', symbol: 'UK' },
    { id: 1, name: 'United States', symbol: 'US' }
  ]

  const tokenAddresses: Record<number, string> = {}

  for (const t of tokens) {
    // Pass CORE_ADDRESS as the "treasury" parameter (it's actually the Core contract)
    const token = await FlagToken.deploy(`Flag ${t.symbol}`, `F${t.symbol}`, CORE_ADDRESS)
    await token.waitForDeployment()
    tokenAddresses[t.id] = await token.getAddress()
    console.log(`   ${t.name} (${t.symbol}) deployed:`, tokenAddresses[t.id])
    // Wait a bit to avoid nonce issues
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // 3) Mint 50k to Core (Core holds inventory)
  console.log('\n3) Minting tokens to Core...')
  for (const t of tokens) {
    const token = await ethers.getContractAt('FlagToken', tokenAddresses[t.id])
    // Mint directly to Core
    const tx = await token.connect(deployer).mint(CORE_ADDRESS, ethers.parseEther('50000'))
    await tx.wait()
    console.log(`   Minted 50k ${t.symbol} to Core`)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // 4) Add countries
  console.log('\n4) Adding countries to Core...')
  const priceStart8 = 500_000_000n // $5
  const kappa8 = 55_000n
  const lambda8 = 55_550n
  const priceMin8 = 1_000_000n

  for (const t of tokens) {
    const tx = await core.addCountry(
      BigInt(t.id),
      t.name,
      tokenAddresses[t.id],
      priceStart8,
      kappa8,
      lambda8,
      priceMin8
    )
    await tx.wait()
    console.log(`   Added ${t.name}`)
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // 5) Unpause (if needed)
  console.log('\n5) Checking Core status...')
  const paused = await core.paused()
  if (paused) {
    const unpauseTx = await core.unpause()
    await unpauseTx.wait()
    console.log('   Core unpaused')
  } else {
    console.log('   Core is already unpaused')
  }

  console.log('\n=== DEPLOYMENT COMPLETE ===')
  console.log('CORE_ADDRESS=', CORE_ADDRESS)
  console.log('TOKEN_TR_ADDRESS=', tokenAddresses[90])
  console.log('TOKEN_UK_ADDRESS=', tokenAddresses[44])
  console.log('TOKEN_US_ADDRESS=', tokenAddresses[1])
  console.log('\nCopy these to .env.local!')
}

main().catch(console.error)
