const { getAddress } = require("viem");

function coreAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_CORE_ADDRESS!;
  return getAddress(addr);
}

function usdcAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_USDC_ADDRESS!;
  return getAddress(addr);
}

// Core contract ABI - sadece gerekli fonksiyonlar
const CORE_ABI = [
  {
    "inputs": [],
    "name": "paused",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getConfig",
    "outputs": [
      {"internalType": "uint256", "name": "priceMin", "type": "uint256"},
      {"internalType": "uint256", "name": "buyFeeBps", "type": "uint256"},
      {"internalType": "uint256", "name": "sellFeeBps", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "countryId", "type": "uint256"}],
    "name": "getCountryInfo",
    "outputs": [
      {"internalType": "string", "name": "name", "type": "string"},
      {"internalType": "address", "name": "token", "type": "address"},
      {"internalType": "uint256", "name": "price", "type": "uint256"},
      {"internalType": "uint256", "name": "totalSupply", "type": "uint256"},
      {"internalType": "uint256", "name": "attacks", "type": "uint256"},
      {"internalType": "bool", "name": "exists", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "countryId", "type": "uint256"}],
    "name": "getCurrentTier",
    "outputs": [
      {"internalType": "uint256", "name": "tier", "type": "uint256"},
      {"internalType": "uint256", "name": "threshold", "type": "uint256"},
      {"internalType": "uint256", "name": "attackFee", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "fromCountryId", "type": "uint256"},
      {"internalType": "uint256", "name": "toCountryId", "type": "uint256"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "attack",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
] as const;

// USDC contract ABI - sadece gerekli fonksiyonlar
const USDC_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

module.exports = { coreAddress, usdcAddress, CORE_ABI, USDC_ABI };