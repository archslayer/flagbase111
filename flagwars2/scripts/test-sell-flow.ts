import { createPublicClient, http, parseAbi, getAddress, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = getAddress(process.env.NEXT_PUBLIC_CORE_ADDRESS!)
const USDC_ADDRESS = getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS!)
const TOKEN_TR = getAddress(process.env.TOKEN_TR_ADDRESS!)
const TEST_USER = getAddress('0xc32e33f743Cf7f95D90d1392771632fF1640dE16') // Your wallet

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const coreAbi = parseAbi([
  'function countries(uint256) view returns (string, address, bool, uint256, uint32, uint32, uint256)',
  'function quoteSell(uint256, uint256) view returns (uint256, uint256, uint256)',
  'function remainingSupply(uint256) view returns (uint256)',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
  'function name() view returns (string)',
  'function nonces(address) view returns (uint256)',
])

async function main() {
  console.log('🧪 SELL Flow Smoke Test\n')
  console.log('📍 Addresses:')
  console.log('  Core:', CORE_ADDRESS)
  console.log('  USDC:', USDC_ADDRESS)
  console.log('  Token TR:', TOKEN_TR)
  console.log('  Test User:', TEST_USER)
  console.log()

  // 1. Check country exists
  console.log('1️⃣ Checking country (TR, id=90)...')
  const country = await pub.readContract({
    address: CORE_ADDRESS,
    abi: coreAbi,
    functionName: 'countries',
    args: [90n]
  })
  const [name, token, exists, price8] = country
  console.log('  Name:', name)
  console.log('  Token:', token)
  console.log('  Exists:', exists)
  console.log('  Price (8 decimals):', price8.toString(), `(${Number(price8) / 1e8} USDC)`)
  
  if (!exists) {
    console.log('❌ Country not deployed!')
    return
  }
  console.log('✅ Country exists\n')

  // 2. Check user token balance
  console.log('2️⃣ Checking user token balance...')
  const userTokenBalance = await pub.readContract({
    address: TOKEN_TR,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [TEST_USER]
  }) as bigint
  console.log('  Raw balance:', userTokenBalance.toString())
  console.log('  Formatted:', formatUnits(userTokenBalance, 18), 'tokens')
  
  if (userTokenBalance === 0n) {
    console.log('⚠️ User has no tokens to sell!')
  } else {
    console.log('✅ User has tokens\n')
  }

  // 3. Check token allowance
  console.log('3️⃣ Checking token allowance (for standard sell)...')
  const tokenAllowance = await pub.readContract({
    address: TOKEN_TR,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [TEST_USER, CORE_ADDRESS]
  }) as bigint
  console.log('  Allowance:', formatUnits(tokenAllowance, 18))
  
  if (tokenAllowance === 0n) {
    console.log('⚠️ No allowance → Will use PERMIT signature')
  } else {
    console.log('✅ Has allowance → Can use standard sell()\n')
  }

  // 4. Check permit support
  console.log('4️⃣ Checking EIP-2612 permit support...')
  try {
    const [tokenName, nonce] = await Promise.all([
      pub.readContract({ address: TOKEN_TR, abi: erc20Abi, functionName: 'name' }),
      pub.readContract({ address: TOKEN_TR, abi: erc20Abi, functionName: 'nonces', args: [TEST_USER] })
    ])
    console.log('  Token name:', tokenName)
    console.log('  User nonce:', nonce.toString())
    console.log('✅ Token supports EIP-2612 permit\n')
  } catch (e) {
    console.log('❌ Token does NOT support permit:', e)
    return
  }

  // 5. Check Core USDC balance
  console.log('5️⃣ Checking Core USDC balance...')
  const coreUSDC = await pub.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [CORE_ADDRESS]
  }) as bigint
  console.log('  Core USDC:', formatUnits(coreUSDC, 6), 'USDC')
  
  if (coreUSDC === 0n) {
    console.log('❌ Core has NO USDC! SELL will revert.')
    return
  }
  console.log('✅ Core has USDC for payouts\n')

  // 6. Simulate SELL quote
  if (userTokenBalance > 0n) {
    console.log('6️⃣ Simulating SELL quote (1 token)...')
    try {
      const [gross, fee, net] = await pub.readContract({
        address: CORE_ADDRESS,
        abi: coreAbi,
        functionName: 'quoteSell',
        args: [90n, 1n * 10n**18n] // 1 token
      }) as [bigint, bigint, bigint]
      
      console.log('  Gross USDC:', formatUnits(gross, 6))
      console.log('  Fee USDC:', formatUnits(fee, 6))
      console.log('  Net USDC:', formatUnits(net, 6))
      console.log('✅ Quote successful\n')
    } catch (e: any) {
      console.log('❌ Quote failed:', e.message)
    }
  }

  // 7. Check remaining supply
  console.log('7️⃣ Checking remaining supply (Core inventory)...')
  try {
    const remaining = await pub.readContract({
      address: CORE_ADDRESS,
      abi: coreAbi,
      functionName: 'remainingSupply',
      args: [90n]
    }) as bigint
    console.log('  Remaining:', formatUnits(remaining, 18), 'tokens')
    console.log('✅ Supply check successful\n')
  } catch (e: any) {
    console.log('❌ Supply check failed:', e.message, '\n')
  }

  // Summary
  console.log('📊 SUMMARY:')
  console.log('  Country exists:', exists ? '✅' : '❌')
  console.log('  User has tokens:', userTokenBalance > 0n ? '✅' : '❌')
  console.log('  Core has USDC:', coreUSDC > 0n ? '✅' : '❌')
  console.log('  Permit support:', '✅')
  console.log()
  console.log('🎯 SELL FLOW:')
  if (userTokenBalance === 0n) {
    console.log('  → User needs to BUY tokens first')
  } else if (tokenAllowance === 0n) {
    console.log('  → User clicks SELL → Sign permit → sellWithPermit() ✅')
  } else {
    console.log('  → User clicks SELL → sell() directly ✅')
  }
}

main().catch(console.error)

