/**
 * Backfill flag count for a user wallet
 */

import dotenv from 'dotenv'
import { createPublicClient, http, getAddress, Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as Address
const RPC_URL = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL

async function getOwnedFlagsCount(wallet: Address): Promise<number> {
  if (!RPC_URL || !CORE_ADDRESS) {
    throw new Error('RPC_URL or CORE_ADDRESS not set')
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  })

  // Get all countries from contract
  const countriesAbi = [
    {
      inputs: [{ name: 'countryId', type: 'uint256' }],
      name: 'countries',
      outputs: [
        { name: 'name', type: 'string' },
        { name: 'token', type: 'address' },
        { name: 'exists', type: 'bool' },
        { name: 'price8', type: 'uint256' },
        { name: 'kappa8', type: 'uint256' },
        { name: 'lambda8', type: 'uint256' },
        { name: 'priceMin8', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  // Get country token addresses
  const countryTokens: Address[] = []
  for (let id = 1; id <= 100; id++) {
    try {
      const country = await publicClient.readContract({
        address: CORE_ADDRESS,
        abi: countriesAbi,
        functionName: 'countries',
        args: [BigInt(id)],
      })

      if (country.exists && country.token) {
        countryTokens.push(country.token as Address)
      }
    } catch (e) {
      // Country doesn't exist or error, continue
      break
    }
  }

  // ERC20 balanceOf ABI
  const erc20Abi = [
    {
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  // Check balance for each token
  let ownedCount = 0

  for (const token of countryTokens) {
    try {
      const balance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet],
      })

      if (balance > 0n) {
        ownedCount++
      }
    } catch (e) {
      // Token might not exist or error, skip
      console.warn(`Failed to check balance for token ${token}:`, e)
    }
  }

  return ownedCount
}

async function updateFlagCount(wallet: string, ownedCount: number) {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set')
  }

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    const db = client.db()

    const checksummed = getAddress(wallet)

    // Update achv_progress
    await db.collection('achv_progress').updateOne(
      { userId: checksummed },
      {
        $set: {
          flagCount: ownedCount,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: checksummed,
          totalAttacks: 0,
          distinctCountriesAttacked: 0,
          referralCount: 0,
          earned: {},
          minted: {},
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )

    // Insert snapshot
    await db.collection('flags_snapshots').insertOne({
      userId: checksummed,
      ownedCount,
      ts: new Date(),
    })

    // Clear Redis cache (if available)
    try {
      const { Redis } = await import('ioredis')
      const redis = new Redis(process.env.REDIS_URL || '', { maxRetriesPerRequest: null })
      await redis.del(`achv:my:${checksummed}`)
      await redis.del(`achv:my:${wallet.toLowerCase()}`)
      await redis.quit()
    } catch (e) {
      // Redis not available, ignore
    }

    console.log(`✅ Updated flagCount for ${checksummed}: ${ownedCount}`)
  } finally {
    await client.close()
  }
}

async function main() {
  const wallet = process.argv[2] || '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
  const address = getAddress(wallet as Address)

  console.log(`🔍 Checking flag count for: ${address}\n`)

  try {
    console.log('1. Reading owned flags from contract...')
    const ownedCount = await getOwnedFlagsCount(address)
    console.log(`   ✅ Found ${ownedCount} owned flags\n`)

    console.log('2. Updating MongoDB...')
    await updateFlagCount(address, ownedCount)
    console.log(`   ✅ Updated flagCount: ${ownedCount}\n`)

    console.log('✅ Backfill complete!\n')
    console.log(`Next: Refresh achievements page to see updated Flag Count`)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()

