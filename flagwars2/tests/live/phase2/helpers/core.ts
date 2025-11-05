const { createPublicClient, createWalletClient, http, custom, getContract } = require("viem");
const { baseSepolia } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");
require('dotenv').config({ path: ".env.local" });

const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || "https://sepolia.base.org";
const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS;
const PK = (process.env.E2E_PRIVATE_KEY || "").trim();

// Load ABI
const path = require('path');
const ABI = require(path.join(__dirname, "../../../../artifacts/contracts/FlagWarsCore_Production.sol/FlagWarsCore_Production.json")).abi;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC),
});

const account = privateKeyToAccount(PK);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC),
});

const coreContract = getContract({
  address: CORE,
  abi: ABI,
  client: publicClient,
});

const coreWriteContract = getContract({
  address: CORE,
  abi: ABI,
  client: walletClient,
});

async function readCountry(id: number): Promise<{
  name: string;
  token: string;
  price8: bigint;
  totalSupply18: bigint;
  attacks: bigint;
  exists: boolean;
}> {
  try {
    const result = await coreContract.read.getCountryInfo([BigInt(id)]);
    const [name, token, price, totalSupply, attacks, exists] = result as [
      string, string, bigint, bigint, bigint, boolean
    ];
    
    return {
      name,
      token,
      price8: BigInt(price),
      totalSupply18: BigInt(totalSupply),
      attacks: BigInt(attacks),
      exists,
    };
  } catch (error) {
    console.error('Error reading country:', error);
    throw error;
  }
}

async function getBuyPrice(countryId: number, amountToken18: string): Promise<bigint> {
  try {
    const { parseUnits } = require("viem");
    const amountWei = parseUnits(amountToken18, 18);
    const price = await coreContract.read.getBuyPrice([BigInt(countryId), amountWei]);
    return BigInt(price.toString());
  } catch (error) {
    console.error('Error getting buy price:', error);
    throw error;
  }
}

async function getSellPrice(countryId: number, amountToken18: string): Promise<bigint> {
  try {
    const { parseUnits } = require("viem");
    const amountWei = parseUnits(amountToken18, 18);
    const price = await coreContract.read.getSellPrice([BigInt(countryId), amountWei]);
    return BigInt(price.toString());
  } catch (error) {
    console.error('Error getting sell price:', error);
    throw error;
  }
}

async function getConfig(): Promise<{
  payToken: string;
  treasury: string;
  revenue: string;
  commissions: string;
  buyFeeBps: number;
  sellFeeBps: number;
  referralShareBps: number;
  revenueShareBps: number;
  priceMin8: bigint;
  kappa: bigint;
  lambda: bigint;
  attackPayableETH: boolean;
}> {
  try {
    const config = await coreContract.read.getConfig();
    return {
      payToken: config[0],
      treasury: config[1],
      revenue: config[2],
      commissions: config[3],
      buyFeeBps: Number(config[4]),
      sellFeeBps: Number(config[5]),
      referralShareBps: Number(config[6]),
      revenueShareBps: Number(config[7]),
      priceMin8: BigInt(config[8]),
      kappa: BigInt(config[9]),
      lambda: BigInt(config[10]),
      attackPayableETH: config[11],
    };
  } catch (error) {
    console.error('Error getting config:', error);
    throw error;
  }
}

async function isPaused(): Promise<boolean> {
  try {
    const paused = await coreContract.read.paused();
    return paused;
  } catch (error) {
    console.error('Error checking pause status:', error);
    return false;
  }
}

async function getCurrentTier(countryId: number): Promise<{
  maxPrice8: bigint;
  delta8: bigint;
  attackFeeUSDC6_orETHwei: bigint;
}> {
  try {
    const tier = await coreContract.read.getCurrentTier([BigInt(countryId)]);
    return {
      maxPrice8: BigInt(tier[0]),
      delta8: BigInt(tier[1]),
      attackFeeUSDC6_orETHwei: BigInt(tier[2]),
    };
  } catch (error) {
    console.error('Error getting current tier:', error);
    throw error;
  }
}

// Write functions
async function buy(countryId: number, amountToken18: string, minOutUSDC6?: bigint): Promise<{ hash: string }> {
  try {
    const { parseUnits } = require("viem");
    const amountWei = parseUnits(amountToken18, 18);
    const minOut = minOutUSDC6 || BigInt(0);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 minutes
    
    // Simulate first
    await coreWriteContract.read.buy([BigInt(countryId), amountWei, minOut, deadline]);
    
    // Send transaction
    const hash = await coreWriteContract.write.buy([BigInt(countryId), amountWei, minOut, deadline]);
    return { hash };
  } catch (error) {
    console.error('Buy transaction error:', error);
    throw error;
  }
}

async function sell(countryId: number, amountToken18: string, minOutUSDC6?: bigint): Promise<{ hash: string }> {
  try {
    const { parseUnits } = require("viem");
    const amountWei = parseUnits(amountToken18, 18);
    const minOut = minOutUSDC6 || BigInt(0);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 120); // 2 minutes
    
    // Simulate first
    await coreWriteContract.read.sell([BigInt(countryId), amountWei, minOut, deadline]);
    
    // Send transaction
    const hash = await coreWriteContract.write.sell([BigInt(countryId), amountWei, minOut, deadline]);
    return { hash };
  } catch (error) {
    console.error('Sell transaction error:', error);
    throw error;
  }
}

async function attack(fromCountryId: number, toCountryId: number, amountToken18: string): Promise<{ hash: string }> {
  try {
    const { parseUnits } = require("viem");
    const amountWei = parseUnits(amountToken18, 18);
    
    // Get attack fee
    const feeInfo = await getCurrentTier(toCountryId);
    const attackFee = feeInfo.attackFeeUSDC6_orETHwei;
    
    // Simulate first
    await coreWriteContract.read.attack([BigInt(fromCountryId), BigInt(toCountryId), amountWei], {
      value: attackFee
    });
    
    // Send transaction
    const hash = await coreWriteContract.write.attack([BigInt(fromCountryId), BigInt(toCountryId), amountWei], {
      value: attackFee
    });
    
    return { hash };
  } catch (error) {
    console.error('Attack transaction error:', error);
    throw error;
  }
}

module.exports = { 
  readCountry, 
  getBuyPrice, 
  getSellPrice, 
  getConfig, 
  isPaused, 
  getCurrentTier, 
  buy, 
  sell, 
  attack 
};
