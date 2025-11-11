// Worker: executes queued attack jobs using a server signer.
// Notes: In production, consider meta-tx or user-signed tx relay.

import { makeWallet, CORE_ABI } from '../lib/tx'
import { ATTACK_FEE_WEI } from '../lib/cfg'
import { begin as tryBegin, clear as end } from '@/idempotency/store'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

export async function executeAttackJob (job: {
  user: `0x${string}`
  fromId: number
  toId: number
  amountToken18: bigint
  idempotencyKey: string
}) {
  if (!(await tryBegin(job.idempotencyKey))) return
  try {
    const pk = process.env.SERVER_SIGNER_PK as `0x${string}`
    if (!pk) throw new Error('SERVER_SIGNER_PK missing')
    const wc = makeWallet(pk as any)

    // optional: read snapshots for logging/telemetry
    await publicClient.readContract({
      address: CORE,
      abi: [{ name: 'getCountryInfo', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
        { type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
      ] }] as any,
      functionName: 'getCountryInfo',
      args: [BigInt(job.fromId)]
    })

    const hash = await wc.writeContract({
      address: CORE,
      abi: CORE_ABI,
      functionName: 'attack',
      args: [BigInt(job.fromId), BigInt(job.toId), job.amountToken18],
      value: ATTACK_FEE_WEI
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    return receipt
  } finally {
    await end(job.idempotencyKey)
  }
}


