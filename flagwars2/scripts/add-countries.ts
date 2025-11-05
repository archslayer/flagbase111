import { config } from 'dotenv'
config({ path: '.env.local' })

import hre from 'hardhat'
const { ethers } = hre

async function main() {
  console.log('=== ADDING COUNTRIES TO CORE ===\n')

  const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS
  if (!CORE_ADDRESS) throw new Error('CORE_ADDRESS not set')
  
  const TOKEN_TR = process.env.TOKEN_TR_ADDRESS || '0x0'
  const TOKEN_UK = process.env.TOKEN_UK_ADDRESS || '0x0'
  const TOKEN_US = process.env.TOKEN_US_ADDRESS || '0x0'

  console.log('Core:', CORE_ADDRESS)
  console.log('')

  const [signer] = await ethers.getSigners()
  console.log('Signer:', signer.address)
  console.log('')

  const core = await ethers.getContractAt('Core', CORE_ADDRESS, signer)

  // Check owner
  const owner = await core.owner()
  console.log('Owner:', owner)
  console.log('Signer:', signer.address)
  console.log('Match:', owner.toLowerCase() === signer.address.toLowerCase())
  console.log('')

  const tokens = [
    { id: 90, name: 'Turkey', symbol: 'TR', token: TOKEN_TR },
    { id: 44, name: 'United Kingdom', symbol: 'UK', token: TOKEN_UK },
    { id: 1, name: 'United States', symbol: 'US', token: TOKEN_US }
  ]

  const priceStart8 = 500_000_000n // $5
  const kappa8 = 55_000n
  const lambda8 = 55_550n
  const priceMin8 = 1_000_000n

  for (const t of tokens) {
    console.log(`Adding ${t.name}...`)
    try {
      const tx = await core.addCountry(
        BigInt(t.id),
        t.name,
        t.token,
        priceStart8,
        kappa8,
        lambda8,
        priceMin8
      )
      console.log(`   TX: ${tx.hash}`)
      const receipt = await tx.wait()
      console.log(`   Confirmed: block ${receipt?.blockNumber}`)
    } catch (error: any) {
      console.log(`   ERROR:`, error.message)
    }
    console.log('')
  }

  console.log('=== DONE ===')
}

main().catch(console.error)
