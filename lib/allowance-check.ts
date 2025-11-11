// Allowance kontrol fonksiyonu - eski ve yeni CORE adreslerini kontrol et
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { CORE_ADDRESS, USDC_ADDRESS } from '@/lib/addresses'

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC)
})

const erc20Abi = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)'
])

// Eski CORE adresi (muhtemelen yanlış)
const OLD_CORE_ADDRESS = '0x7b43bc0432b0b63803667a26c2926c8286ce09c8' as `0x${string}`

export async function checkAllowanceForBothCores(owner: `0x${string}`): Promise<{
  oldCoreAllowance: bigint;
  newCoreAllowance: bigint;
  coreAddress: string;
}> {
  try {
    const [oldAllowance, newAllowance] = await Promise.all([
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, OLD_CORE_ADDRESS]
      }),
      publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, CORE_ADDRESS]
      })
    ])

    console.log('[ALLOWANCE CHECK]', {
      aOld: oldAllowance.toString(),
      aNew: newAllowance.toString(),
      CORE_ADDRESS
    })

    return {
      oldCoreAllowance: oldAllowance,
      newCoreAllowance: newAllowance,
      coreAddress: CORE_ADDRESS
    }
  } catch (error) {
    console.error('[ALLOWANCE CHECK ERROR]', error)
    throw error
  }
}
