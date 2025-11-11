const { createPublicClient, createWalletClient, http, parseAbi, getAddress } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');
const { RPC } = require('./env');

// Minimal ABI (yalnızca kullanılan fonksiyonlar). Gerektikçe eklenir:
const CORE_ABI = parseAbi([
  // reads
  'function getCountryInfo(uint256 id) view returns (string name, address token, uint256 price8, uint256 totalSupply, uint256 attacks, bool exists)',
  // optional reads (capabilities ile test edilir)
  'function getConfig() view returns (address payToken, uint256 buyFeeBps, uint256 sellFeeBps)',
  'function paused() view returns (bool)',
  // writes
  'function buy(uint256 countryId, uint256 amountToken18, uint256 minOutUSDC6, uint256 deadline)',
  'function sell(uint256 countryId, uint256 amountToken18, uint256 minOutUSDC6, uint256 deadline)',
  'function attack(uint256 fromId, uint256 toId, uint256 amountToken18) payable',
]);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC),
});

function makeWalletClient(privateKey) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    chain: baseSepolia,
    transport: http(RPC),
    account: account,
  });
}

module.exports = { CORE_ABI, publicClient, makeWalletClient };