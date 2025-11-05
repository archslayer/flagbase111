require('dotenv').config();

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org';
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const ATTACK_FEE_WEI = BigInt(process.env.NEXT_PUBLIC_ATTACK_FEE_WEI || '100000000000000'); // 0.0001 ETH
const CHAIN_ID = 84532;

if (!/^0x[0-9a-fA-F]{40}$/.test(CORE)) {
  throw new Error('Invalid NEXT_PUBLIC_CORE_ADDRESS');
}

module.exports = { RPC, CORE, ATTACK_FEE_WEI, CHAIN_ID };