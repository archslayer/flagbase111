import { createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { erc20Abi } from 'viem'

async function main() {
  const RPC = 'https://sepolia.base.org'
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

  const tokenTR = '0x497057A2bf42E06Be82EE4ac25A58F825AF3B938' as const
  const coreAddr = '0xA23bD8CbA62a10E3b94EE630bb24e4cDe66d9a29' as const

  const balance = await pub.readContract({
    address: tokenTR,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [coreAddr]
  })

  console.log('Core TR token balance:', balance.toString())
  console.log('Expected: 50000000000000000000000 (50,000 tokens)')
}

main().catch(console.error)
