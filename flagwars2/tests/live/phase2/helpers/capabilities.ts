const { createPublicClient, http, getContract } = require("viem");
const { baseSepolia } = require("viem/chains");
require('dotenv').config({ path: ".env.local" });

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;

// Load ABI
const path = require('path');
const ABI = require(path.join(__dirname, "../../../../artifacts/contracts/FlagWarsCore_Production.sol/FlagWarsCore_Production.json")).abi;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC),
});

const coreContract = getContract({
  address: CORE,
  abi: ABI,
  client: publicClient,
});

async function hasFn(name: string): Promise<boolean> {
  try {
    const c = coreContract.read;
    return typeof (c as any)[name] === 'function';
  } catch {
    return false;
  }
}

async function hasWriteFn(name: string): Promise<boolean> {
  try {
    const c = coreContract.write;
    return typeof (c as any)[name] === 'function';
  } catch {
    return false;
  }
}

async function detectCapabilities(): Promise<{
  getBuyPrice: boolean;
  getSellPrice: boolean;
  getConfig: boolean;
  paused: boolean;
  getCurrentTier: boolean;
  buy: boolean;
  sell: boolean;
  attack: boolean;
}> {
  return {
    getBuyPrice: await hasFn('getBuyPrice'),
    getSellPrice: await hasFn('getSellPrice'),
    getConfig: await hasFn('getConfig'),
    paused: await hasFn('paused'),
    getCurrentTier: await hasFn('getCurrentTier'),
    buy: await hasWriteFn('buy'),
    sell: await hasWriteFn('sell'),
    attack: await hasWriteFn('attack'),
  };
}

module.exports = { hasFn, hasWriteFn, detectCapabilities };
