import { createPublicClient, http, parseAbi, getAddress, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CORE_ADDRESS = getAddress(process.env.NEXT_PUBLIC_CORE_ADDRESS!)
const USDC_ADDRESS = getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS!)
const TOKEN_TR = getAddress(process.env.TOKEN_TR_ADDRESS!)
const TEST_USER = getAddress('0xc32e33f743Cf7f95D90d1392771632fF1640dE16')

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const coreAbi = parseAbi([
  'function countries(uint256) view returns (string, address, bool, uint256, uint32, uint32, uint256)',
  'function quoteBuy(uint256, uint256) view returns (uint256, uint256, uint256)',
  'function remainingSupply(uint256) view returns (uint256)',
])

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
])

async function main() {
  console.log('🧪 BUY Flow Smoke Test\n')
  console.log('📍 Addresses:')
  console.log('  Core:', CORE_ADDRESS)
  console.log('  USDC:', USDC_ADDRESS)
  console.log('  Token TR:', TOKEN_TR)
  console.log('  Test User:', TEST_USER)
  console.log()

  // 1. Check user USDC balance
  console.log('1️⃣ Checking user USDC balance...')
  const userUSDC = await pub.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [TEST_USER]
  }) as bigint
  console.log('  Balance:', formatUnits(userUSDC, 6), 'USDC')
  
  if (userUSDC === 0n) {
    console.log('❌ User has no USDC!')
    return
  }
  console.log('✅ User has USDC\n')

  // 2. Check USDC allowance
  console.log('2️⃣ Checking USDC allowance to Core...')
  const usdcAllowance = await pub.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [TEST_USER, CORE_ADDRESS]
  }) as bigint
  console.log('  Allowance:', formatUnits(usdcAllowance, 6), 'USDC')
  
  if (usdcAllowance === 0n) {
    console.log('⚠️ No allowance → User needs to APPROVE first')
  } else {
    console.log('✅ Has allowance → Can buy directly\n')
  }

  // 3. Check country exists
  console.log('3️⃣ Checking country (TR, id=90)...')
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

  // 4. Check remaining supply (Core inventory)
  console.log('4️⃣ Checking remaining supply (Core inventory)...')
  try {
    const remaining = await pub.readContract({
      address: CORE_ADDRESS,
      abi: coreAbi,
      functionName: 'remainingSupply',
      args: [90n]
    }) as bigint
    console.log('  Remaining:', formatUnits(remaining, 18), 'tokens')
    
    if (remaining === 0n) {
      console.log('❌ No tokens available!')
      return
    }
    console.log('✅ Tokens available\n')
  } catch (e: any) {
    console.log('❌ Supply check failed:', e.message)
    return
  }

  // 5. Simulate BUY quote
  console.log('5️⃣ Simulating BUY quote (1 token)...')
  try {
    const [gross, fee, net] = await pub.readContract({
      address: CORE_ADDRESS,
      abi: coreAbi,
      functionName: 'quoteBuy',
      args: [90n, 1n * 10n**18n] // 1 token
    }) as [bigint, bigint, bigint]
    
    console.log('  Gross USDC:', formatUnits(gross, 6))
    console.log('  Fee USDC:', formatUnits(fee, 6))
    console.log('  Net USDC (to pay):', formatUnits(net, 6))
    
    // Check if user has enough
    const maxIn = net + (net * 200n) / 10000n // 2% slippage
    console.log('  Max USDC (with 2% slippage):', formatUnits(maxIn, 6))
    
    if (userUSDC < net) {
      console.log('❌ User has insufficient USDC')
    } else if (usdcAllowance < maxIn) {
      console.log('⚠️ User needs to approve more USDC')
    } else {
      console.log('✅ User can buy now')
    }
    console.log()
  } catch (e: any) {
    console.log('❌ Quote failed:', e.message, '\n')
  }

  // Summary
  console.log('📊 SUMMARY:')
  console.log('  Country exists:', exists ? '✅' : '❌')
  console.log('  User has USDC:', userUSDC > 0n ? '✅' : '❌')
  console.log('  User has allowance:', usdcAllowance > 0n ? '✅' : '❌')
  console.log()
  console.log('🎯 BUY FLOW:')
  if (userUSDC === 0n) {
    console.log('  → User needs USDC first (get from faucet)')
  } else if (usdcAllowance === 0n) {
    console.log('  → User clicks BUY → Approve USDC → buy() ✅')
  } else {
    console.log('  → User clicks BUY → buy() directly ✅')
  }
}

main().catch(console.error)

