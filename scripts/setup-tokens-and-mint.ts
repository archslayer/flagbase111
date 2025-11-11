// scripts/setup-tokens-and-mint.ts
// 1. Token'ların Core'unu set eder
// 2. Core'dan token'ları mint eder (Core'a)
// 3. Core'a USDC gönderir

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const DEPLOYER_PK = (process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PK) as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'

if (!CORE) {
  throw new Error('NEXT_PUBLIC_CORE_ADDRESS not set in .env.local')
}
if (!USDC) {
  throw new Error('NEXT_PUBLIC_USDC_ADDRESS not set in .env.local')
}
if (!DEPLOYER_PK) {
  throw new Error('DEPLOYER_PRIVATE_KEY or DEPLOYER_PK not set in .env.local')
}

// Token adresleri
const TOKEN_TR = process.env.TURKEY_TOKEN_ADDRESS as `0x${string}`
const TOKEN_UK = process.env.UK_TOKEN_ADDRESS as `0x${string}`
const TOKEN_US = process.env.US_TOKEN_ADDRESS as `0x${string}`

// FlagWarsToken ABI (setCore, mint)
const FLAG_WARS_TOKEN_ABI = parseAbi([
  'function setCore(address coreAddress)',
  'function mint(address to, uint256 amount)',
  'function owner() view returns (address)',
  'function core() view returns (address)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)'
])

// ERC20 ABI (transfer for USDC)
const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
])

async function main() {
  console.log('🔧 Setting up tokens and minting...\n')
  console.log('Core:', CORE)
  console.log('USDC:', USDC)
  console.log('')

  const account = privateKeyToAccount(DEPLOYER_PK as `0x${string}`)
  const deployerAddress = account.address

  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC)
  })
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC)
  })

  const tokens = [
    { address: TOKEN_TR, name: 'Turkey Token', id: 90 },
    { address: TOKEN_UK, name: 'UK Token', id: 44 },
    { address: TOKEN_US, name: 'US Token', id: 1 }
  ]

  // 1. Set Core for each token (if not already set)
  console.log('='.repeat(60))
  console.log('1. SETTING CORE FOR TOKENS')
  console.log('='.repeat(60))

  for (const token of tokens) {
    if (!token.address) {
      console.log(`\n${token.name}: Not set in .env.local`)
      continue
    }

    try {
      // Check current core
      const currentCore = await publicClient.readContract({
        address: token.address,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'core',
        args: []
      }) as `0x${string}`

      if (currentCore.toLowerCase() === CORE.toLowerCase()) {
        console.log(`\n${token.name}: Core already set to ${CORE}`)
        continue
      }

      if (currentCore !== '0x0000000000000000000000000000000000000000') {
        console.log(`\n${token.name}: Core already set to ${currentCore} (different from new Core)`)
        console.log(`  ⚠️  Cannot change Core once set`)
        continue
      }

      // Check owner
      const owner = await publicClient.readContract({
        address: token.address,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'owner',
        args: []
      }) as `0x${string}`

      if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
        console.log(`\n${token.name}: Owner is ${owner}, deployer is ${deployerAddress}`)
        console.log(`  ⚠️  Cannot set Core - not owner`)
        continue
      }

      // Set Core
      console.log(`\n${token.name}: Setting Core to ${CORE}...`)
      const hash = await wallet.writeContract({
        address: token.address,
        abi: FLAG_WARS_TOKEN_ABI,
        functionName: 'setCore',
        args: [CORE]
      })

      console.log(`  Transaction hash: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Core set! (Block: ${receipt.blockNumber})`)

      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (e: any) {
      console.error(`\n${token.name}: Error setting Core -`, e.message)
    }
  }

  // 2. Mint tokens from Core to Core (Core holds the inventory)
  const TOKENS_PER_COUNTRY = parseUnits('50000', 18) // 50,000 tokens

  console.log('\n' + '='.repeat(60))
  console.log('2. MINTING TOKENS FROM CORE')
  console.log('='.repeat(60))
  console.log(`Amount per country: ${formatUnits(TOKENS_PER_COUNTRY, 18)} tokens\n`)

  // Core'dan mint etmek için Core'un owner'ı olması gerekir
  // Ama Core contract'ı token'ları mint edemez çünkü Core.sol'da mint fonksiyonu yok
  // O zaman Core'u owner yapmamız gerekir... Ama bu mümkün değil çünkü token'lar Ownable.

  // Alternatif: Owner (deployer) olarak mint edip Core'a transfer edelim
  // Ama FlagWarsToken'da mint sadece Core'dan yapılabilir!

  // Çözüm: Core contract'ına mint fonksiyonu eklemek gerekir VEYA
  // Token'ları farklı bir şekilde deploy etmek gerekir.

  // Şimdilik: Core'un owner olmasını sağlayamayız, o yüzden token'ları başka bir yöntemle mint etmemiz gerekiyor.
  // Ama Core.sol'da mint yok, sadece transfer var.

  // Bekle, Core.sol'da mint yok ama token contract'ında var ve Core'dan çağrılabilir.
  // Ama Core contract'ı token'ları mint edemez çünkü Core.sol'da mint fonksiyonu yok.

  // O zaman: Token'ları deployer olarak mint edip Core'a transfer edemeyiz çünkü mint sadece Core'dan yapılabilir.
  // Core'u owner yapamayız çünkü token'lar Ownable ve owner değiştirilemez (sadece transferOwnership ile).

  // Çözüm: Core contract'ına bir mint fonksiyonu eklemek VEYA
  // Token'ları yeniden deploy etmek (Core'u constructor'da set etmek).

  console.log('\n⚠️  Token minting requires Core to be the minter.')
  console.log('   But Core.sol does not have a mint function.')
  console.log('   Token contracts (FlagWarsToken) only allow Core to mint.')
  console.log('   This requires either:')
  console.log('   1. Adding a mint function to Core.sol, OR')
  console.log('   2. Redeploying tokens with Core set in constructor, OR')
  console.log('   3. Using a different token contract type (FlagToken with owner mint)')
  console.log('\n   For now, we will skip token minting and only fund USDC.')

  // 3. Transfer USDC to Core (for sell operations)
  const USDC_AMOUNT = parseUnits('10000', 6) // 10,000 USDC (6 decimals)

  console.log('\n' + '='.repeat(60))
  console.log('3. TRANSFERRING USDC TO CORE')
  console.log('='.repeat(60))
  console.log(`Amount: ${formatUnits(USDC_AMOUNT, 6)} USDC\n`)

  try {
    // Check balance
    const balance = await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [deployerAddress]
    }) as bigint

    console.log(`Deployer USDC balance: ${balance.toString()} (${formatUnits(balance, 6)} USDC)`)

    if (balance < USDC_AMOUNT) {
      console.log(`  ⚠️  Insufficient balance - need ${formatUnits(USDC_AMOUNT, 6)} USDC, have ${formatUnits(balance, 6)} USDC`)
      console.log(`  Transferring available balance: ${formatUnits(balance, 6)} USDC`)
      
      if (balance > 0n) {
        const hash = await wallet.writeContract({
          address: USDC,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [CORE, balance]
        })

        console.log(`  Transaction hash: ${hash}`)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        console.log(`  ✅ Transferred! (Block: ${receipt.blockNumber})`)
      }
    } else {
      const hash = await wallet.writeContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [CORE, USDC_AMOUNT]
      })

      console.log(`  Transaction hash: ${hash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  ✅ Transferred! (Block: ${receipt.blockNumber})`)
    }
  } catch (e: any) {
    console.error(`  ❌ Error:`, e.message)
  }

  console.log('\n🎉 Done!')
  console.log('\n⚠️  NOTE: Token minting is not possible with current setup.')
  console.log('   Core.sol does not have a mint function.')
  console.log('   You need to either:')
  console.log('   1. Add a mint function to Core.sol that calls token.mint(), OR')
  console.log('   2. Redeploy tokens with a different contract type that allows owner minting')
}

main().catch((e) => {
  console.error('❌ Script failed:', e)
  process.exit(1)
})

