// Rules: Always generate quotes close to execution time and enforce freshness with assertFresh.
// Never send buy/sell without minOut derived from a fresh quote.

import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { SLIPPAGE_BPS, QUOTE_MAX_STALE_MS } from './cfg'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) })
const ONE_E18 = 10n ** 18n

export type Quote = {
  countryId: number
  amountToken18: bigint
  price8: bigint
  usdc6Est: bigint
  minOut: bigint
  ts: number
}

export async function getBuyQuote (countryId: number, amountToken18: bigint): Promise<Quote> {
  const [, , price8] = await publicClient.readContract({
    address: CORE,
    abi: [
      {
        name: 'getCountryInfo', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'id', type: 'uint256' }],
        outputs: [
          { type: 'string' }, { type: 'address' }, { type: 'uint256' },
          { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
        ]
      }
    ] as any,
    functionName: 'getCountryInfo',
    args: [BigInt(countryId)]
  }) as any

  const usdc6Est = (amountToken18 * price8) / ONE_E18 / 100n
  const minOut = (usdc6Est * BigInt(10000 - SLIPPAGE_BPS)) / 10000n
  return { countryId, amountToken18, price8, usdc6Est, minOut, ts: Date.now() }
}

export async function getSellQuote (countryId: number, amountToken18: bigint): Promise<Quote> {
  // For symmetrical estimate using current price8 snapshot.
  const [, , price8] = await publicClient.readContract({
    address: CORE,
    abi: [
      {
        name: 'getCountryInfo', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'id', type: 'uint256' }],
        outputs: [
          { type: 'string' }, { type: 'address' }, { type: 'uint256' },
          { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
        ]
      }
    ] as any,
    functionName: 'getCountryInfo',
    args: [BigInt(countryId)]
  }) as any

  const usdc6Est = (amountToken18 * price8) / ONE_E18 / 100n
  const minOut = (usdc6Est * BigInt(10000 - SLIPPAGE_BPS)) / 10000n
  return { countryId, amountToken18, price8, usdc6Est, minOut, ts: Date.now() }
}

export function assertFresh (q: Quote) {
  if (Date.now() - q.ts > QUOTE_MAX_STALE_MS) throw new Error('QUOTE_STALE')
}


