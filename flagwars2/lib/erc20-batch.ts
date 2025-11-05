// lib/erc20-batch.ts
// Multicall ile USDC balance ve allowance'ı tek seferde oku
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)'
])

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC, { batch: true }) // HTTP batch aktif
})

export async function readUsdcBalAndAllowance(user: `0x${string}`) {
  const [bal, alw] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [user] },
      { address: USDC, abi: erc20Abi, functionName: 'allowance', args: [user, CORE] }
    ]
  })
  return { balance: bal as bigint, allowance: alw as bigint }
}

