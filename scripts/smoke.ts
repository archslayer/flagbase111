// scripts/smoke.ts
import { config } from 'dotenv'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

config({ path: '.env.local' })

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const RPC  = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE || !USDC) {
  throw new Error('Missing environment variables. Check .env.local file.')
}

// === TEST PARAM ===
const USER  = process.env.TEST_WALLET_ADDR as `0x${string}` || '0xc32e33f743cf7f95d90d1392771632ff1640de16'
const ID    = BigInt(90)       // Turkey
const N     = 1n               // 1 adet token
const DEADLINE = BigInt(Math.floor(Date.now()/1000) + 600)

const CORE_ABI = parseAbi([
  'function buy(uint256 countryId, uint256 amountToken18, uint256 minOut, uint256 deadline)',
  'function sell(uint256 countryId, uint256 amountToken18, uint256 minOut, uint256 deadline)',
  'function getCountryInfo(uint256 countryId) view returns (string, address, uint256, uint256, uint256, bool)',
  'function remainingSupply(uint256 id) view returns (uint256)',
  'function getUserBalance(uint256 id, address user) view returns (uint256)',
  'function cfg() view returns (address payToken, address feeToken, address treasury, address revenue, address commissions, uint16 buyFeeBps, uint16 sellFeeBps, uint16 referralShareBps, uint16 revenueShareBps, uint64 priceMin8, uint64 kappa, uint64 lambda, bool attackFeeInUSDC, uint64 tier1Price8, uint64 tier2Price8, uint64 tier3Price8, uint64 delta1_8, uint64 delta2_8, uint64 delta3_8, uint64 delta4_8, uint32 fee1_USDC6, uint32 fee2_USDC6, uint32 fee3_USDC6, uint32 fee4_USDC6, uint256 fee1_TOKEN18, uint256 fee2_TOKEN18, uint256 fee3_TOKEN18, uint256 fee4_TOKEN18)',
  // Custom errors for decode
  'error ErrInsufficientTreasuryUSDC()',
  'error ErrInvalidFee()',
  'error ErrAmountZero()',
  'error ErrTxAmountTooLarge()',
  'error ErrDeadline()',
  'error ErrUSDCInMismatch()',
  'error SlippageExceeded()',
  'error InsufficientSupply()'
])

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)'
])

const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) })

// Correct calculation matching contract formula
function calcBuyCostUSDC6Exact(
  nTokens18: bigint,
  price8: bigint,
  kappa: bigint,
  buyFeeBps: bigint
): { grossUSDC6: bigint; feeUSDC6: bigint; netUSDC6: bigint } {
  if (nTokens18 <= 0n) return { grossUSDC6: 0n, feeUSDC6: 0n, netUSDC6: 0n }
  
  const n = nTokens18 / 10n**18n // whole tokens
  
  // Contract formula: totalPrice8 = n*P + κ*(n²)/2
  const linear8 = n * price8
  const quad8 = (kappa * n * n) / 2n
  const totalPrice8 = linear8 + quad8
  
  // PRICE8 -> USDC6 (/100)
  const grossUSDC6 = totalPrice8 / 100n
  
  // BUY fee is ADDED
  const feeUSDC6 = (grossUSDC6 * buyFeeBps) / 10000n
  const netUSDC6 = grossUSDC6 + feeUSDC6
  
  return { grossUSDC6, feeUSDC6, netUSDC6 }
}

async function main() {
  console.log('RPC:', RPC)
  console.log('CORE:', CORE)
  console.log('USDC:', USDC)
  console.log('USER:', USER)

  // 1) USDC decimals
  const usdcDec = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'decimals' })
  if (usdcDec !== 6) throw new Error(`USDC decimals != 6: got ${usdcDec}`)
  console.log('✓ USDC decimals = 6')

  // 2) Read cfg() to get real kappa/buyFeeBps
  let cfg: any
  try {
    cfg = await pc.readContract({ address: CORE, abi: CORE_ABI, functionName: 'cfg' })
    console.log('✓ cfg() read successfully')
    console.log('  kappa:', cfg.kappa.toString())
    console.log('  buyFeeBps:', cfg.buyFeeBps.toString())
  } catch (e) {
    console.log('⚠️  cfg() failed, using fallback')
    cfg = { kappa: 55000n, buyFeeBps: 0n }
  }

  // 3) getCountryInfo
  const info = await pc.readContract({ address: CORE, abi: CORE_ABI, functionName: 'getCountryInfo', args: [ID] })
  console.log('getCountryInfo result:', info)
  const exists = info[5] as boolean
  if (!exists) throw new Error(`Country ${ID} does not exist`)
  const price8 = info[2] as bigint
  const totalSupply = info[3] as bigint

  console.log('Country exists:', exists)
  console.log('Country price8:', price8.toString())
  console.log('TotalSupply   :', totalSupply.toString())
  
  // Read remainingSupply
  let remaining = 0n
  try {
    remaining = await pc.readContract({ address: CORE, abi: CORE_ABI, functionName: 'remainingSupply', args: [ID] })
    console.log('✓ remainingSupply read:', remaining.toString())
  } catch (e) {
    console.log('⚠️  remainingSupply failed, using totalSupply')
    remaining = totalSupply
  }
  
  // 4) User balances
  const usdcBal = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [USER] })
  const allowance = await pc.readContract({ address: USDC, abi: ERC20_ABI, functionName: 'allowance', args: [USER, CORE] })
  const userTokBefore = await pc.readContract({ address: CORE, abi: CORE_ABI, functionName: 'getUserBalance', args: [ID, USER] })

  console.log('User USDC balance  :', usdcBal.toString())
  console.log('User USDC allowance:', allowance.toString())
  console.log('User token18 before:', userTokBefore.toString())

  // 5) Teorik maliyet (EXACT contract formula)
  const amount18 = N * 10n**18n
  
  if (remaining < amount18) throw new Error(`Insufficient remainingSupply: ${remaining} < ${amount18}`)
  
  // Use real cfg() values
  const kappa = BigInt(cfg.kappa)
  const buyFeeBps = BigInt(cfg.buyFeeBps)
  
  const { grossUSDC6, feeUSDC6, netUSDC6 } = calcBuyCostUSDC6Exact(amount18, price8, kappa, buyFeeBps)
  
  console.log('Using cfg() values:')
  console.log('  kappa:', kappa.toString())
  console.log('  buyFeeBps:', buyFeeBps.toString())
  console.log('Gross USDC6:', grossUSDC6.toString())
  console.log('Fee USDC6  :', feeUSDC6.toString())
  console.log('Net USDC6  :', netUSDC6.toString())
  
  // Contract checks grossUSDC6 against maxIn, so maxIn must include fee + slippage
  // Try with 50% slippage to find what contract wants
  const maxIn50pct = (netUSDC6 * 15000n) / 10000n
  const maxIn = maxIn50pct
  
  console.log('MaxIn (50% slippage):', maxIn.toString())
  console.log('User USDC balance (USDC6):', usdcBal.toString())
  console.log('User allowance      :', allowance.toString())

  console.log('\n=== Simulating BUY ===')
  console.log('Args:', {
    countryId: ID.toString(),
    amountToken18: amount18.toString(),
    maxInUSDC6: maxIn.toString(),
    deadline: DEADLINE.toString()
  })

  if (usdcBal < maxIn) throw new Error('Insufficient USDC balance for BUY (maxIn)')
  if (allowance < maxIn) throw new Error('Insufficient USDC allowance for BUY (approve to CORE)')

  // 6) Preflight simulate (BUY)
  try {
    await pc.simulateContract({
      address: CORE,
      abi: CORE_ABI,
      functionName: 'buy',
      args: [ID, amount18, maxIn, DEADLINE],
      account: USER
    })
    console.log('✓ BUY simulate passed')
  } catch (simError: any) {
    console.log('BUY simulate failed:', simError.message)
    console.log('Error signature:', simError.signature || 'N/A')
    throw simError
  }

  console.log('\n—— Smoke test PASSED. Eğer simulate geçtiyse; wallet ile aynı argümanlarla yazılabilir.\n')
}

main().catch((e) => {
  console.error('\n✗ Smoke test FAILED\n', e)
  process.exit(1)
})
