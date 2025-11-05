import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { config } from 'dotenv'
config({ path: '.env.local' })

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

// Transaction to verify
const TX_HASH = '0xfea4268bff2dc64122796da3f8fd9ea2f11c484ea5d55d22e14be783f533eeb5'
const USER_ADDRESS = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16' as `0x${string}`
const COUNTRY_ID = 1 // US

const ABI = parseAbi([
  'function countries(uint256 id) view returns (string name, address token, bool exists, uint256 price8, uint32 kappa8, uint32 lambda8, uint256 priceMin8)',
  'function remainingSupply(uint256 id) view returns (uint256)',
  'function TREASURY() view returns (address)',
  'function USDC() view returns (address)'
])

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
])

async function main() {
  console.log('=== VERIFYING BUY TRANSACTION ===\n')
  console.log('TX_HASH:', TX_HASH)
  console.log('USER:', USER_ADDRESS)
  console.log('COUNTRY_ID:', COUNTRY_ID)
  console.log('')

  // 1) Get transaction receipt
  console.log('1) Fetching transaction receipt...')
  const receipt = await client.getTransactionReceipt({ hash: TX_HASH as `0x${string}` })
  console.log('   Status:', receipt.status === 'success' ? '✅ SUCCESS' : '❌ FAILED')
  console.log('   Block:', receipt.blockNumber.toString())
  console.log('   Gas used:', receipt.gasUsed.toString())
  console.log('')

  // 2) Check token address for country
  console.log('2) Getting country token address...')
  const country = await client.readContract({
    address: CORE,
    abi: ABI,
    functionName: 'countries',
    args: [BigInt(COUNTRY_ID)]
  }) as any
  
  const tokenAddress = country[1] as `0x${string}`
  console.log('   Token address:', tokenAddress)
  console.log('')

  // 3) Check user's token balance BEFORE transaction (at previous block)
  console.log('3) Checking user token balance BEFORE transaction...')
  const beforeBlock = Number(receipt.blockNumber) - 1
  const userBalanceBefore = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [USER_ADDRESS],
    blockNumber: BigInt(beforeBlock)
  })
  console.log('   User balance BEFORE:', userBalanceBefore.toString())
  console.log('   User balance BEFORE (tokens):', (BigInt(userBalanceBefore) / BigInt(1e18)).toString())
  console.log('')

  // 4) Check user's token balance AFTER transaction
  console.log('4) Checking user token balance AFTER transaction...')
  const userBalanceAfter = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [USER_ADDRESS],
    blockNumber: receipt.blockNumber
  })
  console.log('   User balance AFTER:', userBalanceAfter.toString())
  console.log('   User balance AFTER (tokens):', (BigInt(userBalanceAfter) / BigInt(1e18)).toString())
  console.log('   Tokens received:', (BigInt(userBalanceAfter - userBalanceBefore) / BigInt(1e18)).toString())
  console.log('')

  // 5) Check Treasury's token balance
  console.log('5) Checking Treasury token balance...')
  const treasuryAddress = await client.readContract({
    address: CORE,
    abi: ABI,
    functionName: 'TREASURY'
  }) as `0x${string}`
  
  const treasuryBalanceBefore = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [treasuryAddress],
    blockNumber: BigInt(beforeBlock)
  })
  
  const treasuryBalanceAfter = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [treasuryAddress],
    blockNumber: receipt.blockNumber
  })
  
  console.log('   Treasury address:', treasuryAddress)
  console.log('   Treasury balance BEFORE:', (BigInt(treasuryBalanceBefore) / BigInt(1e18)).toString(), 'tokens')
  console.log('   Treasury balance AFTER:', (BigInt(treasuryBalanceAfter) / BigInt(1e18)).toString(), 'tokens')
  console.log('   Treasury lost:', (BigInt(treasuryBalanceBefore - treasuryBalanceAfter) / BigInt(1e18)).toString(), 'tokens')
  console.log('')

  // 6) Check Core's USDC balance
  console.log('6) Checking Core contract USDC balance...')
  const coreUsdcBalanceBefore = await client.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [CORE],
    blockNumber: BigInt(beforeBlock)
  })
  
  const coreUsdcBalanceAfter = await client.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [CORE],
    blockNumber: receipt.blockNumber
  })
  
  console.log('   Core USDC BEFORE:', (BigInt(coreUsdcBalanceBefore) / BigInt(1e6)).toString(), 'USDC')
  console.log('   Core USDC AFTER:', (BigInt(coreUsdcBalanceAfter) / BigInt(1e6)).toString(), 'USDC')
  console.log('   Core received:', (BigInt(coreUsdcBalanceAfter - coreUsdcBalanceBefore) / BigInt(1e6)).toString(), 'USDC')
  console.log('')

  // 7) Check user's USDC balance
  console.log('7) Checking user USDC balance...')
  const userUsdcBalanceBefore = await client.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [USER_ADDRESS],
    blockNumber: BigInt(beforeBlock)
  })
  
  const userUsdcBalanceAfter = await client.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [USER_ADDRESS],
    blockNumber: receipt.blockNumber
  })
  
  console.log('   User USDC BEFORE:', (BigInt(userUsdcBalanceBefore) / BigInt(1e6)).toString(), 'USDC')
  console.log('   User USDC AFTER:', (BigInt(userUsdcBalanceAfter) / BigInt(1e6)).toString(), 'USDC')
  console.log('   User paid:', (BigInt(userUsdcBalanceBefore - userUsdcBalanceAfter) / BigInt(1e6)).toString(), 'USDC')
  console.log('')

  // 8) Check remaining supply
  console.log('8) Checking remaining supply...')
  const remainingBefore = await client.readContract({
    address: CORE,
    abi: ABI,
    functionName: 'remainingSupply',
    args: [BigInt(COUNTRY_ID)],
    blockNumber: BigInt(beforeBlock)
  })
  
  const remainingAfter = await client.readContract({
    address: CORE,
    abi: ABI,
    functionName: 'remainingSupply',
    args: [BigInt(COUNTRY_ID)],
    blockNumber: receipt.blockNumber
  })
  
  console.log('   Remaining supply BEFORE:', (BigInt(remainingBefore) / BigInt(1e18)).toString(), 'tokens')
  console.log('   Remaining supply AFTER:', (BigInt(remainingAfter) / BigInt(1e18)).toString(), 'tokens')
  console.log('   Supply decreased by:', (BigInt(remainingBefore - remainingAfter) / BigInt(1e18)).toString(), 'tokens')
  console.log('')

  // 9) Summary
  console.log('=== VERIFICATION SUMMARY ===')
  console.log('✅ User received 1 token:', userBalanceAfter - userBalanceBefore === BigInt(1e18) ? 'YES' : 'NO')
  console.log('✅ Treasury lost 1 token:', treasuryBalanceBefore - treasuryBalanceAfter === BigInt(1e18) ? 'YES' : 'NO')
  console.log('✅ User paid 5 USDC:', userUsdcBalanceBefore - userUsdcBalanceAfter === BigInt(5e6) ? 'YES' : 'NO')
  console.log('✅ Core received 5 USDC:', coreUsdcBalanceAfter - coreUsdcBalanceBefore === BigInt(5e6) ? 'YES' : 'NO')
  console.log('✅ Supply decreased by 1:', remainingBefore - remainingAfter === BigInt(1e18) ? 'YES' : 'NO')
}

main().catch(console.error)
