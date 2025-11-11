const { createPublicClient, createWalletClient, http, parseAbi } = require('viem')
const { privateKeyToAccount } = require('viem/accounts')
const { baseSepolia } = require('viem/chains')
const { RPC } = require('./env')

const CORE_ABI = parseAbi([
  'function getCountryInfo(uint256) view returns (string,address,uint256,uint256,uint256,bool)',
  'function getConfig() view returns (address,uint256,uint256)',
  'function paused() view returns (bool)',
  'function buy(uint256,uint256,uint256,uint256)',
  'function sell(uint256,uint256,uint256,uint256)',
  'function attack(uint256,uint256,uint256) payable',
])

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) })
const makeWalletClient = (pk) => {
  const account = privateKeyToAccount(pk)
  return createWalletClient({ chain: baseSepolia, transport: http(RPC), account })
}

module.exports = { CORE_ABI, publicClient, makeWalletClient }
