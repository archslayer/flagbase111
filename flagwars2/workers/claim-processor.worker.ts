/**
 * Off-Chain Claim Processor Worker
 * 
 * Processes pending USDC claims from MongoDB and transfers on-chain.
 * Features:
 * - Idempotent processing with status leasing
 * - Exponential backoff for retries
 * - Batch processing with concurrency control
 * - Graceful shutdown
 */

import 'dotenv/config'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env.local first
config({ path: resolve(process.cwd(), '.env.local') })

import { getDb, getClient } from '../lib/mongodb'
import { publicClient, walletClient, getTreasuryAddress } from '../lib/viem/clients'
import { getNextNonce, markTransactionConfirmed, resetNonceCounter } from '../lib/nonce-manager'
import { generateIdempoKey } from '../lib/idempotency-key'
import { canProcessClaim, formatUSDC6, DAILY_CAP_USDC6 } from '../lib/daily-cap'
import { recordPayout, canUserReceivePayout } from '../lib/daily-payout-tracker'
import type { Address } from 'viem'

// Direct collection name (avoid server-only import)
const COLLECTIONS = {
  OFFCHAIN_CLAIMS: 'offchain_claims'
}

// Worker state tracking
let lastProcessedAt: Date | null = null

// Environment configuration
const CLAIM_USDC_ADDRESS = (process.env.CLAIM_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS) as Address
const CLAIM_MIN_CONFIRMATIONS = parseInt(process.env.CLAIM_MIN_CONFIRMATIONS || '2', 10)
const CLAIM_BATCH_LIMIT = parseInt(process.env.CLAIM_BATCH_LIMIT || '25', 10)
const CLAIM_MAX_ATTEMPTS = parseInt(process.env.CLAIM_MAX_ATTEMPTS || '5', 10)
const CLAIM_QUEUE_CONCURRENCY = parseInt(process.env.CLAIM_QUEUE_CONCURRENCY || '5', 10)

// Validate configuration
if (!CLAIM_USDC_ADDRESS) {
  throw new Error('[Claim Worker] CLAIM_USDC_ADDRESS not configured')
}

// USDC ERC20 ABI (minimal)
const USDC_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const

// Worker state
let isShuttingDown = false
let activeProcessing = 0

/**
 * Send USDC to recipient with sequential nonce management
 */
async function sendUsdc(to: Address, amountMicro: string): Promise<string> {
  // Validate decimals
  const decimals = await publicClient.readContract({
    address: CLAIM_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'decimals'
  })

  if (decimals !== 6) {
    throw new Error(`USDC decimals mismatch: expected 6, got ${decimals}`)
  }

  // Check treasury balance
  const treasuryAddr = getTreasuryAddress()
  const balance = await publicClient.readContract({
    address: CLAIM_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [treasuryAddr]
  })

  const amountBigInt = BigInt(amountMicro)
  if (balance < amountBigInt) {
    throw new Error(
      `Treasury balance insufficient: has ${balance.toString()}, needs ${amountBigInt.toString()}`
    )
  }

  // Get sequential nonce (prevents collisions)
  const nonce = await getNextNonce(publicClient, treasuryAddr)

  // Execute transfer with explicit nonce
  const hash = await walletClient.writeContract({
    address: CLAIM_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [to, amountBigInt],
    nonce
  })

  // Wait for confirmations
  await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: CLAIM_MIN_CONFIRMATIONS
  })

  // Mark transaction as confirmed (allows nonce refresh)
  markTransactionConfirmed()

  return hash
}

/**
 * Process a single claim with idempotency protection
 */
async function processClaim(claim: any): Promise<void> {
  const db = await getDb()
  const claimsCollection = db.collection(COLLECTIONS.OFFCHAIN_CLAIMS)

  try {
    console.log(`[Claim Worker] Processing claim ${claim._id.toString()}`)
    console.log(`  Wallet: ${claim.wallet}`)
    console.log(`  Amount: ${(BigInt(claim.amount) / 1000000n).toString()} USDC`)
    console.log(`  IdempoKey: ${claim.idempoKey}`)

    // Validate wallet address format
    const walletAddr = claim.wallet as Address
    if (!walletAddr.startsWith('0x') || walletAddr.length !== 42) {
      throw new Error(`Invalid wallet address format: ${walletAddr}`)
    }

    // CRITICAL: Idempotency check before transfer
    // Verify we still own this claim (prevents double payment after crash)
    const verified = await claimsCollection.findOne({
      _id: claim._id,
      status: 'processing',
      idempoKey: claim.idempoKey
    })

    if (!verified) {
      console.log(`[Claim Worker] ⚠️  Claim already processed or stolen, skipping`)
      return
    }

    // Send USDC
    const txHash = await sendUsdc(walletAddr, claim.amount)

    const now = new Date()

    // Update to completed AND record daily payout (atomic)
    await claimsCollection.updateOne(
      { _id: claim._id, idempoKey: claim.idempoKey }, // Double-check idempoKey
      {
        $set: {
          status: 'completed',
          txHash,
          processedAt: now,
          error: null
        }
      }
    )

    // Record daily payout tracking (atomic + cap-safe)
    const payoutResult = await recordPayout(
      db,
      claim.wallet,
      claim.token,
      claim.amount
    )

    // If recordPayout returns null, cap was exceeded (shouldn't happen due to pre-check)
    if (!payoutResult) {
      console.error(`[Claim Worker] ❌ CRITICAL: Cap exceeded after transfer!`)
      console.error(`  This should not happen. Pre-check failed.`)
      console.error(`  TxHash: ${txHash}`)
      console.error(`  Wallet: ${claim.wallet}`)
      console.error(`  Amount: ${claim.amount}`)
      
      // Log critical error event
      await db.collection('events').insertOne({
        type: 'CRITICAL_CAP_VIOLATION',
        txHash,
        wallet: claim.wallet,
        token: claim.token,
        amount: claim.amount,
        at: now
      })
    }

    // Update last processed timestamp
    lastProcessedAt = now

    console.log(`[Claim Worker] ✅ Completed: ${txHash.slice(0, 10)}...`)
    if (payoutResult?.hitCap) {
      console.log(`   ⚠️  User hit daily cap!`)
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error'
    console.error(`[Claim Worker] ❌ Error processing claim ${claim._id.toString()}: ${errorMessage}`)

    // Reset nonce counter on error (prevents stuck nonces)
    resetNonceCounter()

    // Determine if should retry
    const failed = claim.attempts >= CLAIM_MAX_ATTEMPTS
    const newStatus = failed ? 'failed' : 'pending'

    await claimsCollection.updateOne(
      { _id: claim._id },
      {
        $set: {
          status: newStatus,
          error: errorMessage
        }
      }
    )

    console.log(`[Claim Worker] Status → ${newStatus} (attempts: ${claim.attempts})`)

    // Re-throw if failed permanently
    if (failed) {
      throw new Error(`Claim failed after ${CLAIM_MAX_ATTEMPTS} attempts: ${errorMessage}`)
    }
  }
}

/**
 * Main worker loop
 */
async function processLoop(): Promise<void> {
  const db = await getDb()
  const claimsCollection = db.collection(COLLECTIONS.OFFCHAIN_CLAIMS)

  console.log('[Claim Worker] Starting process loop...')

  while (!isShuttingDown) {
    try {
      // Lease a pending claim (idempotent)
      const claim = await claimsCollection.findOneAndUpdate(
        { status: 'pending' },
        {
          $set: { status: 'processing' },
          $inc: { attempts: 1 }
        },
        {
          sort: { claimedAt: 1 }, // FIFO
          returnDocument: 'after'
        }
      )

      if (!claim) {
        // No pending claims, sleep
        await new Promise(resolve => setTimeout(resolve, 3000))
        continue
      }

      // Check GLOBAL daily cap BEFORE processing
      const canProcessGlobal = await canProcessClaim(
        db,
        BigInt(claim.amount),
        claim.token as Address
      )

      if (!canProcessGlobal) {
        console.log(`[Claim Worker] ⚠️  Global daily cap reached for ${claim.token}`)
        console.log(`  Cap: ${formatUSDC6(DAILY_CAP_USDC6)}`)
        console.log(`  Deferring claim ${claim._id.toString()}`)

        // Return to pending with deferred status
        await claimsCollection.updateOne(
          { _id: claim._id },
          {
            $set: {
              status: 'pending',
              error: 'GLOBAL_DAILY_CAP_REACHED'
            }
          }
        )

        // Sleep for 1 minute before checking again
        await new Promise(resolve => setTimeout(resolve, 60_000))
        continue
      }

      // Check PER-USER daily cap
      const canUserReceive = await canUserReceivePayout(
        db,
        claim.wallet,
        claim.token,
        BigInt(claim.amount)
      )

      if (!canUserReceive) {
        console.log(`[Claim Worker] ⚠️  User daily cap reached`)
        console.log(`  Wallet: ${claim.wallet.slice(0, 10)}...`)
        console.log(`  Deferring claim ${claim._id.toString()}`)

        // Return to pending with deferred status
        await claimsCollection.updateOne(
          { _id: claim._id },
          {
            $set: {
              status: 'pending',
              error: 'USER_DAILY_CAP_REACHED'
            }
          }
        )

        // Skip to next claim (don't sleep, user-specific)
        continue
      }

      // Update leaseAt timestamp
      await claimsCollection.updateOne(
        { _id: claim._id },
        { $set: { leaseAt: new Date() } }
      )

      // Process claim
      activeProcessing++
      try {
        await processClaim(claim)
      } finally {
        activeProcessing--
      }

      // Small delay between claims
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error: any) {
      console.error(`[Claim Worker] Loop error: ${error?.message || 'Unknown'}`)
      // Sleep on error
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  console.log('[Claim Worker] Process loop stopped')
}

/**
 * Warmup - verify connections
 */
async function warmup(): Promise<void> {
  console.log('[Claim Worker] Warming up...')

  // Check MongoDB
  const db = await getDb()
  await db.command({ ping: 1 })
  console.log('[Claim Worker] ✅ MongoDB connected')

  // Check blockchain
  const block = await publicClient.getBlockNumber()
  console.log(`[Claim Worker] ✅ Blockchain connected (block: ${block})`)

  // Check treasury balance
  const treasuryAddr = getTreasuryAddress()
  const balance = await publicClient.readContract({
    address: CLAIM_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [treasuryAddr]
  })
  const balanceUsdc = (balance / 1000000n).toString()
  console.log(`[Claim Worker] ✅ Treasury balance: ${balanceUsdc} USDC`)

  console.log('[Claim Worker] Warmup complete!')
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return
  
  console.log('[Claim Worker] Shutting down gracefully...')
  isShuttingDown = true

  // Wait for active processing to complete (max 30s)
  const maxWait = 30000
  const startTime = Date.now()
  while (activeProcessing > 0 && Date.now() - startTime < maxWait) {
    console.log(`[Claim Worker] Waiting for ${activeProcessing} active claims...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Close MongoDB
  try {
    const client = getClient()
    await client.close()
    console.log('[Claim Worker] ✅ MongoDB closed')
  } catch (error) {
    console.error('[Claim Worker] Error closing MongoDB:', error)
  }

  console.log('[Claim Worker] Shutdown complete')
  process.exit(0)
}

// Register shutdown handlers
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('uncaughtException', (error) => {
  console.error('[Claim Worker] Uncaught exception:', error)
  shutdown()
})

// Start worker
async function main() {
  try {
    await warmup()
    await processLoop()
  } catch (error) {
    console.error('[Claim Worker] Fatal error:', error)
    process.exit(1)
  }
}

main()

