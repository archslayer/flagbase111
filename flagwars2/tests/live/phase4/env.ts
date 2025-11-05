require('dotenv').config({ path: '.env.local' })
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS
const ATTACK_FEE_WEI = BigInt(process.env.NEXT_PUBLIC_ATTACK_FEE_WEI || '100000000000000')
const CHAIN_ID = 84532

console.log('CORE address:', CORE)
if (!CORE || !/^0x[0-9a-fA-F]{40}$/.test(CORE)) {
  console.error('Invalid NEXT_PUBLIC_CORE_ADDRESS:', CORE)
  throw new Error('Invalid NEXT_PUBLIC_CORE_ADDRESS')
}

module.exports = { RPC, CORE, ATTACK_FEE_WEI, CHAIN_ID }
