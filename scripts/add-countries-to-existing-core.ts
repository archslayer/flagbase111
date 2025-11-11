import { config } from 'dotenv'
config({ path: '.env.local' })

import hre from 'hardhat'
const { ethers } = hre

async function main() {
  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS
  const TREASURY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  
  const TOKENS = {
    90: process.env.TOKEN_TR_ADDRESS!,
    44: process.env.TOKEN_UK_ADDRESS!,
    1: process.env.TOKEN_US_ADDRESS!
  }

  console.log('Core:', CORE_ADDRESS)
  console.log('Treasury:', TREASURY)
  console.log('')

  const Core = await ethers.getContractAt('Core', CORE_ADDRESS!)

  const priceStart8 = 500_000_000n // $5
  const kappa8 = 55_000n
  const lambda8 = 55_550n
  const priceMin8 = 1_000_000n

  const countries = [
    { id: 90, name: 'Turkey', token: TOKENS[90] },
    { id: 44, name: 'United Kingdom', token: TOKENS[44] },
    { id: 1, name: 'United States', token: TOKENS[1] }
  ]

  for (const c of countries) {
    try {
      const tx = await Core.addCountry(
        BigInt(c.id),
        c.name,
        c.token,
        priceStart8,
        kappa8,
        lambda8,
        priceMin8
      )
      await tx.wait()
      console.log(`✅ Added ${c.name}`)
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log(`⚠️  ${c.name} already exists`)
      } else {
        console.error(`❌ Error adding ${c.name}:`, e.message)
      }
    }
  }

  console.log('\n✅ Done!')
}

main().catch(console.error)
