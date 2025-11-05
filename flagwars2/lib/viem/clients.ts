/**
 * Viem Clients for Claim Processing
 * - Public client for reading blockchain state
 * - Wallet client for treasury operations
 * - Treasury address getter
 * 
 * Note: Lazy initialization to allow env vars to load first
 */

import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, baseSepolia } from 'viem/chains'
import type { PublicClient, WalletClient } from 'viem'

let _publicClient: PublicClient | null = null
let _walletClient: WalletClient | null = null
let _treasuryAddress: Address | null = null

function initialize() {
  if (_publicClient) return

  // Environment validation
  const CHAIN_ID = parseInt(process.env.CHAIN_ID || '8453', 10)
  const BASE_RPC = process.env.BASE_RPC || ''
  const CLAIM_TREASURY_PK = process.env.CLAIM_TREASURY_PK || ''

  if (!BASE_RPC) {
    throw new Error('[Viem Clients] BASE_RPC not configured')
  }

  if (!CLAIM_TREASURY_PK || !CLAIM_TREASURY_PK.startsWith('0x')) {
    throw new Error('[Viem Clients] CLAIM_TREASURY_PK not configured or invalid')
  }

  // Chain selection
  const chain = CHAIN_ID === 84532 ? baseSepolia : base

  // Treasury account from private key
  const treasuryAccount = privateKeyToAccount(CLAIM_TREASURY_PK as `0x${string}`)
  _treasuryAddress = treasuryAccount.address

  // Public client for reading blockchain state
  _publicClient = createPublicClient({
    chain,
    transport: http(BASE_RPC, {
      batch: true,
      retryCount: 3,
      retryDelay: 1000
    })
  }) as PublicClient

  // Wallet client for treasury operations
  _walletClient = createWalletClient({
    account: treasuryAccount,
    chain,
    transport: http(BASE_RPC, {
      batch: false, // Don't batch writes
      retryCount: 3,
      retryDelay: 1000
    })
  }) as WalletClient

  // Log initialization (no PII)
  console.log(`[Viem Clients] Initialized`)
  console.log(`  Chain: ${chain.name} (${CHAIN_ID})`)
  console.log(`  Treasury: ${treasuryAccount.address}`)
  console.log(`  RPC: ${BASE_RPC.split('@')[0]}...`)
}

// Public client for reading blockchain state
export const publicClient = new Proxy({} as PublicClient, {
  get(target, prop) {
    initialize()
    return (_publicClient as any)[prop]
  }
})

// Wallet client for treasury operations
export const walletClient = new Proxy({} as WalletClient, {
  get(target, prop) {
    initialize()
    return (_walletClient as any)[prop]
  }
})

/**
 * Get treasury wallet address
 */
export function getTreasuryAddress(): Address {
  initialize()
  return _treasuryAddress!
}

