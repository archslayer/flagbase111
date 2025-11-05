import { add } from './_report.mjs'
import { loadEnv } from './_env.mjs'
import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

export default async function run() {
  const env = loadEnv()
  let ok = true

  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(env.NEXT_PUBLIC_RPC_BASE_SEPOLIA) })
    const core = env.NEXT_PUBLIC_CORE_ADDRESS

    const info90 = await client.readContract({ address: core, abi: [
      { name: 'getCountryInfo', type: 'function', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [
        { type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
      ] }
    ], functionName: 'getCountryInfo', args: [90n] })
    const info44 = await client.readContract({ address: core, abi: [
      { name: 'getCountryInfo', type: 'function', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [
        { type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }
      ] }
    ], functionName: 'getCountryInfo', args: [44n] })

    add('## Contract Read Health\n')
    add(`- Country 90 price8: ${info90[2]?.toString?.() || String(info90)}\n`)
    add(`- Country 44 price8: ${info44[2]?.toString?.() || String(info44)}\n`)
    add('**Result:** ✅ PASS\n')
  } catch (e) {
    ok = false
    add(`## Contract Read Health\n**Error:** ${e?.message || e}\n\n**Result:** ❌ FAIL\n`)
  }
  return ok
}


