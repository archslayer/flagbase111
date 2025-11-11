import { createPublicClient, http, parseAbi, getAddress } from 'viem'
import { baseSepolia } from 'viem/chains'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TOKEN_TR = process.env.TOKEN_TR_ADDRESS as `0x${string}`
const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

const permitAbi = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function nonces(address) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
])

async function main() {
  console.log('🔍 Testing Permit Domain for TR token:', TOKEN_TR)
  
  const testAddr = getAddress('0xc32e33f743Cf7f95D90d1392771632fF1640dE16')
  
  const [name, nonces, domainSep] = await Promise.all([
    pub.readContract({ address: TOKEN_TR, abi: permitAbi, functionName: 'name' }),
    pub.readContract({ address: TOKEN_TR, abi: permitAbi, functionName: 'nonces', args: [testAddr] }),
    pub.readContract({ address: TOKEN_TR, abi: permitAbi, functionName: 'DOMAIN_SEPARATOR' }),
  ])
  
  let version = '1'
  try {
    version = await pub.readContract({ address: TOKEN_TR, abi: permitAbi, functionName: 'version' }) as string
  } catch {
    console.log('⚠️ version() not found, using default "1"')
  }
  
  console.log('\n📋 Token Info:')
  console.log('  Name:', name)
  console.log('  Version:', version)
  console.log('  Nonces[test]:', nonces.toString())
  console.log('  DOMAIN_SEPARATOR:', domainSep)
  
  console.log('\n✅ Use these values in UI for EIP-712 domain:')
  console.log('  domain.name:', name)
  console.log('  domain.version:', version)
  console.log('  domain.chainId: 84532')
  console.log('  domain.verifyingContract:', TOKEN_TR)
}

main().catch(console.error)

