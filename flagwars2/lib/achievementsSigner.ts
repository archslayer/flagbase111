import 'server-only'
import { privateKeyToAccount } from 'viem/accounts'
import { getAddress, type Address } from 'viem'

// ════════════════════════════════════════════════════════════════════════════════
// EIP-712 SIGNATURE FOR ACHIEVEMENT MINT AUTHORIZATION
// ════════════════════════════════════════════════════════════════════════════════

const DOMAIN_NAME = 'FlagWarsAchievements'
const DOMAIN_VERSION = '1'
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532')
const VERIFYING_CONTRACT = process.env.ACHIEVEMENTS_SBT_ADDRESS as Address

if (!VERIFYING_CONTRACT) {
  throw new Error('ACHIEVEMENTS_SBT_ADDRESS not set in environment')
}

const PRIVATE_KEY = process.env.ACHV_SIGNER_PRIVATE_KEY as `0x${string}`
if (!PRIVATE_KEY) {
  throw new Error('ACHV_SIGNER_PRIVATE_KEY not set in environment')
}

// EIP-712 Domain
const domain = {
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  chainId: CHAIN_ID,
  verifyingContract: VERIFYING_CONTRACT,
} as const

// MintAuth type
const types = {
  MintAuth: [
    { name: 'user', type: 'address' },
    { name: 'category', type: 'uint256' },
    { name: 'level', type: 'uint256' },
    { name: 'priceUSDC6', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export interface MintAuth {
  user: Address
  category: bigint
  level: bigint
  priceUSDC6: bigint
  nonce: bigint
  deadline: bigint
}

/**
 * Sign a mint authorization using EIP-712
 */
export async function signMintAuth(auth: MintAuth): Promise<`0x${string}`> {
  const account = privateKeyToAccount(PRIVATE_KEY)

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'MintAuth',
    message: {
      user: getAddress(auth.user),
      category: auth.category,
      level: auth.level,
      priceUSDC6: auth.priceUSDC6,
      nonce: auth.nonce,
      deadline: auth.deadline,
    },
  })

  return signature
}

/**
 * Get the signer's address (for verification purposes)
 */
export function getSignerAddress(): Address {
  const account = privateKeyToAccount(PRIVATE_KEY)
  return account.address
}

