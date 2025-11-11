import { config } from 'dotenv'
config({ path: '.env.local' })

import { createWalletClient, createPublicClient, http, parseEther } from 'viem'
import { baseSepolia, privateKeyToAccount } from 'viem/chains'
import fs from 'fs/promises'

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TREASURY_PK = process.env.TREASURY_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
if (!USDC_ADDRESS) throw new Error('USDC_ADDRESS not set')

const account = privateKeyToAccount(DEPLOYER_PK as `0x${string}`)
const treasury = privateKeyToAccount(TREASURY_PK as `0x${string}`)
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) })
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

// Compile contracts
const FlagTokenABI = [
  { inputs: [{ type: 'string' }, { type: 'string' }, { type: 'address' }], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ type: 'address' }, { type: 'uint256' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ type: 'address' }, { type: 'address' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' }
] as const

const CoreABI = [
  { inputs: [{ type: 'address' }, { type: 'address' }], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ type: 'uint256' }, { type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint32' }, { type: 'uint32' }, { type: 'uint256' }], name: 'addCountry', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'unpause', outputs: [], stateMutability: 'nonpayable', type: 'function' }
] as const

async function main() {
  console.log('=== DEPLOYING NEW CORE SYSTEM ===\n')
  console.log('Deployer:', account.address)
  console.log('Treasury:', treasury.address)
  console.log('USDC:', USDC_ADDRESS)
  console.log('')

  // 1) Deploy Core
  console.log('1) Deploying Core...')
  const coreBytecode = await fs.readFile('./artifacts/contracts/Core.sol/Core.json', 'utf8')
    .then(j => JSON.parse(j).bytecode)
  
  const coreHash = await wallet.deployContract({
    abi: CoreABI,
    bytecode: coreBytecode as `0x${string}`,
    args: [USDC_ADDRESS, treasury.address]
  })
  const coreReceipt = await pub.waitForTransactionReceipt({ hash: coreHash })
  const CORE_ADDRESS = coreReceipt.contractAddress
  console.log('   Core deployed:', CORE_ADDRESS)

  // 2) Deploy FlagToken for each country
  console.log('\n2) Deploying FlagTokens...')
  const tokenBytecode = await fs.readFile('./artifacts/contracts/FlagToken.sol/FlagToken.json', 'utf8')
    .then(j => JSON.parse(j).bytecode)

  const tokens = [
    { id: 90, name: 'Turkey', symbol: 'TR' },
    { id: 44, name: 'United Kingdom', symbol: 'UK' },
    { id: 1, name: 'United States', symbol: 'US' }
  ]

  const tokenAddresses: Record<number, string> = {}

  for (const t of tokens) {
    const hash = await wallet.deployContract({
      abi: FlagTokenABI,
      bytecode: tokenBytecode as `0x${string}`,
      args: [`Flag ${t.symbol}`, `F${t.symbol}`, treasury.address]
    })
    const receipt = await pub.waitForTransactionReceipt({ hash })
    tokenAddresses[t.id] = receipt.contractAddress!
    console.log(`   ${t.name} (${t.symbol}) deployed:`, receipt.contractAddress)
  }

  // 3) Mint 50k tokens to treasury for each
  console.log('\n3) Minting 50k tokens to treasury...')
  for (const t of tokens) {
    const tokenAddr = tokenAddresses[t.id]
    const hash = await wallet.writeContract({
      address: tokenAddr as `0x${string}`,
      abi: FlagTokenABI,
      functionName: 'mint',
      args: [treasury.address, parseEther('50000')]
    })
    await pub.waitForTransactionReceipt({ hash })
    console.log(`   Minted 50k ${t.symbol} to treasury`)
  }

  // 4) Treasury approves Core for all tokens
  console.log('\n4) Treasury approving Core...')
  const treasuryWallet = createWalletClient({ account: treasury, chain: baseSepolia, transport: http(rpc) })
  
  for (const t of tokens) {
    const tokenAddr = tokenAddresses[t.id]
    const hash = await treasuryWallet.writeContract({
      address: tokenAddr as `0x${string}`,
      abi: FlagTokenABI,
      functionName: 'approve',
      args: [CORE_ADDRESS!, 2n**256n - 1n]
    })
    await pub.waitForTransactionReceipt({ hash })
    console.log(`   Treasury approved ${t.symbol}`)
  }

  // 5) Add countries to Core
  console.log('\n5) Adding countries to Core...')
  const priceStart8 = 500_000_000n // $5
  const kappa8 = 55_000n // 0.00055
  const lambda8 = 55_550n // 0.0005555
  const priceMin8 = 1_000_000n // $0.01

  for (const t of tokens) {
    const hash = await wallet.writeContract({
      address: CORE_ADDRESS!,
      abi: CoreABI,
      functionName: 'addCountry',
      args: [
        BigInt(t.id),
        t.name,
        tokenAddresses[t.id],
        priceStart8,
        kappa8,
        lambda8,
        priceMin8
      ]
    })
    await pub.waitForTransactionReceipt({ hash })
    console.log(`   Added ${t.name} to Core`)
  }

  // 6) Unpause Core
  console.log('\n6) Unpausing Core...')
  const unpauseHash = await wallet.writeContract({
    address: CORE_ADDRESS!,
    abi: CoreABI,
    functionName: 'unpause'
  })
  await pub.waitForTransactionReceipt({ hash: unpauseHash })
  console.log('   Core unpaused')

  console.log('\n=== DEPLOYMENT COMPLETE ===')
  console.log('CORE_ADDRESS:', CORE_ADDRESS)
  console.log('TOKEN_TR_ADDRESS:', tokenAddresses[90])
  console.log('TOKEN_UK_ADDRESS:', tokenAddresses[44])
  console.log('TOKEN_US_ADDRESS:', tokenAddresses[1])
  console.log('\nUpdate .env.local with these addresses!')
}

main().catch(console.error)
