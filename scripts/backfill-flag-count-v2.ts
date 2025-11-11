/**
 * Backfill flag count using profile inventory API or contract getUserBalance
 */

import dotenv from 'dotenv'
import { createPublicClient, http, getAddress, Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as Address
const RPC_URL = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL

// ABI for countries() to get token address
const CORE_ABI_COUNTRIES = [
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'countries',
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'exists', type: 'bool' },
      { name: 'price8', type: 'uint256' },
      { name: 'kappa8', type: 'uint32' },
      { name: 'lambda8', type: 'uint32' },
      { name: 'priceMin8', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ERC20 balanceOf ABI
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Active countries (from constants)
const ACTIVE_COUNTRIES = [1, 2, 44, 90] // US, UK, Argentina, Turkey (adjust based on your constants)

async function getOwnedFlagsCountContract(wallet: Address): Promise<number> {
  if (!RPC_URL || !CORE_ADDRESS) {
    throw new Error('RPC_URL or CORE_ADDRESS not set')
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  })

  // Get token addresses via countries() then check ERC20 balanceOf
  let ownedCount = 0

  // Check active countries first
  for (const countryId of ACTIVE_COUNTRIES) {
    try {
      const country = await publicClient.readContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI_COUNTRIES,
        functionName: 'countries',
        args: [BigInt(countryId)],
      })

      if (country.exists && country.token) {
        const balance = await publicClient.readContract({
          address: country.token as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet],
        })

        if (balance > 0n) {
          ownedCount++
          console.log(`  ✅ Country ${countryId} (${country.name}): ${balance} tokens`)
        }
      }
    } catch (e: any) {
      // Country might not exist, skip
      if (countryId <= 10) {
        console.warn(`  Country ${countryId}: ${e.message}`)
      }
    }
  }

  // Also check other countries (1-100)
  console.log(`Checking additional countries (1-100)...`)
  for (let id = 1; id <= 100; id++) {
    if (ACTIVE_COUNTRIES.includes(id)) continue // Already checked

    try {
      const country = await publicClient.readContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI_COUNTRIES,
        functionName: 'countries',
        args: [BigInt(id)],
      })

      if (country.exists && country.token) {
        const balance = await publicClient.readContract({
          address: country.token as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [wallet],
        })

        if (balance > 0n) {
          ownedCount++
          console.log(`  ✅ Country ${id} (${country.name}): ${balance} tokens`)
        }
      } else {
        // If country doesn't exist, we can break early
        if (id > 50) break
      }
    } catch (e) {
      // Break if error suggests end of countries
      if (id > 50) break
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

    // Get existing progress
    const existing = await db.collection('achv_progress').findOne({ userId: checksummed })
    
    // Update achv_progress with flagCount
    await db.collection('achv_progress').updateOne(
      { userId: checksummed },
      {
        $set: {
          flagCount: ownedCount,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: checksummed,
          totalAttacks: existing?.totalAttacks || 0,
          distinctCountriesAttacked: existing?.distinctCountriesAttacked || 0,
          referralCount: existing?.referralCount || 0,
          earned: existing?.earned || {},
          minted: existing?.minted || {},
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

    // Update earned levels (need to recalculate)
    const progress = await db.collection('achv_progress').findOne({ userId: checksummed })
    if (progress) {
      // Calculate earned levels for flag count (category 5)
      const flagThresholds = [5, 50, 250, 500]
      const earnedLevels = flagThresholds.filter(threshold => ownedCount >= threshold)
      
      const earned = progress.earned || {}
      earned['5'] = earnedLevels
      
      await db.collection('achv_progress').updateOne(
        { userId: checksummed },
        {
          $set: {
            earned,
            updatedAt: new Date(),
          },
        }
      )
      
      console.log(`  ✅ Earned Flag Count levels: ${earnedLevels.join(', ') || 'none'}`)
    }

    // Clear Redis cache
    try {
      const { Redis } = await import('ioredis')
      if (process.env.REDIS_URL) {
        const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
        await redis.del(`achv:my:${checksummed}`)
        await redis.del(`achv:my:${wallet.toLowerCase()}`)
        await redis.quit()
        console.log('  ✅ Redis cache cleared')
      }
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
    console.log('1. Reading owned flags from contract (countries + balanceOf)...')
    const ownedCount = await getOwnedFlagsCountContract(address)
    console.log(`\n   ✅ Found ${ownedCount} owned flags\n`)

    if (ownedCount === 0) {
      console.log('⚠️  Warning: No flags found. This might be correct if wallet has no tokens.')
      console.log('   If you believe there should be flags, check:')
      console.log('   - Wallet address is correct')
      console.log('   - Flags are on Base Sepolia network')
      console.log('   - Profile page shows owned flags\n')
    }

    console.log('2. Updating MongoDB...')
    await updateFlagCount(address, ownedCount)

    console.log('\n✅ Backfill complete!\n')
    console.log(`Next steps:`)
    console.log(`  1. Refresh achievements page (Ctrl+Shift+R)`)
    console.log(`  2. Check Flag Count: should show ${ownedCount}`)
    console.log(`  3. If it's wrong, check profile page for actual owned flags\n`)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
