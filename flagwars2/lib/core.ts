import { createPublicClient, createWalletClient, http, custom, getContract, parseUnits, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";
import { translateContractError } from "@/lib/error-handler";
import FlagWarsCore from "@/artifacts/contracts/FlagWarsCore_Production.sol/FlagWarsCore_Production.json";

// Types
export interface CountryInfo {
  id: number;
  name: string;
  token: string;
  price: string;
  attacks: string;
  totalSupply: string;
  exists: boolean;
}

export interface ConfigInfo {
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
}

// Public client
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(env.RPC_BASE_SEPOLIA || "https://sepolia.base.org"),
});

// Contract instance
const coreContract = getContract({
  address: env.CORE as `0x${string}`,
  abi: FlagWarsCore.abi,
  client: publicClient,
});

// Capability detection
export async function hasFn(name: string): Promise<boolean> {
  try {
    const c = coreContract.read;
    return typeof (c as any)[name] === 'function';
  } catch {
    return false;
  }
}

// Core reader functions
export const coreRead = {
  async getCountryInfo(countryId: number): Promise<CountryInfo> {
    try {
      const result = await coreContract.read.getCountryInfo([BigInt(countryId)]);
      const [name, token, price, totalSupply, attacks, exists] = result as [
        string, string, bigint, bigint, bigint, boolean
      ];
      
      return {
        id: countryId,
        name,
        token,
        price: price.toString(),
        attacks: attacks.toString(),
        totalSupply: totalSupply.toString(),
        exists,
      };
    } catch (error) {
      console.error('Error getting country info:', error);
      throw new Error(translateContractError(error, 'en'));
    }
  },

  async getBuyPrice(countryId: number, amountToken18: string): Promise<bigint> {
    try {
      const amountWei = parseUnits(amountToken18, 18);
      const price = await coreContract.read.getBuyPrice([BigInt(countryId), amountWei]);
      return BigInt(price.toString());
    } catch (error) {
      console.error('Error getting buy price:', error);
      // Fallback calculation using kappa
      const countryInfo = await this.getCountryInfo(countryId);
      const basePrice = BigInt(countryInfo.price);
      const kappa = BigInt(550000); // 0.00055 * 1e8
      const buyPrice = basePrice + (kappa / BigInt(2));
      const totalCost = (buyPrice * parseUnits(amountToken18, 18)) / parseUnits("1", 18);
      return totalCost / BigInt(100); // Convert 8 decimals to 6 decimals (USDC6)
    }
  },

  async getSellPrice(countryId: number, amountToken18: string): Promise<bigint> {
    try {
      const amountWei = parseUnits(amountToken18, 18);
      const price = await coreContract.read.getSellPrice([BigInt(countryId), amountWei]);
      return BigInt(price.toString());
    } catch (error) {
      console.error('Error getting sell price:', error);
      // Fallback calculation using lambda
      const countryInfo = await this.getCountryInfo(countryId);
      const basePrice = BigInt(countryInfo.price);
      const lambda = BigInt(555500); // 0.0005555 * 1e8
      const sellPrice = basePrice - (lambda / BigInt(2));
      const grossProceeds = (sellPrice * parseUnits(amountToken18, 18)) / parseUnits("1", 18);
      const sellFeeBps = BigInt(500); // 5%
      const fee = (grossProceeds * sellFeeBps) / BigInt(10000);
      const netProceeds = grossProceeds - fee;
      return netProceeds / BigInt(100); // Convert 8 decimals to 6 decimals (USDC6)
    }
  },

  async getConfig(): Promise<ConfigInfo> {
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
      throw new Error(translateContractError(error, 'en'));
    }
  },

  async isPaused(): Promise<boolean> {
    try {
      const paused = await coreContract.read.paused();
      return paused;
    } catch (error) {
      console.error('Error checking pause status:', error);
      return false;
    }
  },

  async getCurrentTier(countryId: number): Promise<{maxPrice8: bigint, delta8: bigint, attackFeeUSDC6_orETHwei: bigint}> {
    try {
      const tier = await coreContract.read.getCurrentTier([BigInt(countryId)]);
      return {
        maxPrice8: BigInt(tier[0]),
        delta8: BigInt(tier[1]),
        attackFeeUSDC6_orETHwei: BigInt(tier[2]),
      };
    } catch (error) {
      console.error('Error getting current tier:', error);
      // Fallback: return spec values
      return {
        maxPrice8: BigInt("1000000000000000000000"), // 1000 ETH
        delta8: BigInt("130000"), // 0.0013 USDC in price8
        attackFeeUSDC6_orETHwei: BigInt(process.env.NEXT_PUBLIC_ATTACK_FEE_WEI || "100000000000000"), // 0.0001 ETH
      };
    }
  }
};

// Core writer functions
export function createCoreWriter(walletClient: any) {
  const wallet = createWalletClient({
    chain: baseSepolia,
    transport: custom(walletClient),
  });

  const contract = getContract({
    address: env.CORE as `0x${string}`,
    abi: FlagWarsCore.abi,
    client: wallet,
  });

  return {
    publicClient,
    
    async buy({ countryId, amount, minOut, deadline }: { 
      countryId: number; 
      amount: string; 
      minOut?: string;
      deadline?: bigint;
    }) {
      try {
        const amountWei = parseUnits(amount, 18);
        const minOutWei = minOut ? parseUnits(minOut, 6) : BigInt(0);
        const deadlineTime = deadline || BigInt(Math.floor(Date.now() / 1000) + 120); // 2 minutes default
        
        console.log(`Buying ${amount} tokens for country ${countryId}`);
        
        // Simulate first
        await contract.read.buy([BigInt(countryId), amountWei, minOutWei, deadlineTime]);
        
        // Send transaction
        const hash = await contract.write.buy([BigInt(countryId), amountWei, minOutWei, deadlineTime]);
        return { hash };
      } catch (error) {
        console.error('Buy transaction error:', error);
        throw new Error(translateContractError(error, 'en'));
      }
    },
    
    async sell({ countryId, amount, minOut, deadline }: { 
      countryId: number; 
      amount: string; 
      minOut?: string;
      deadline?: bigint;
    }) {
      try {
        const amountWei = parseUnits(amount, 18);
        const minOutWei = minOut ? parseUnits(minOut, 6) : BigInt(0);
        const deadlineTime = deadline || BigInt(Math.floor(Date.now() / 1000) + 120); // 2 minutes default
        
        console.log(`Selling ${amount} tokens for country ${countryId}`);
        
        // Simulate first
        await contract.read.sell([BigInt(countryId), amountWei, minOutWei, deadlineTime]);
        
        // Send transaction
        const hash = await contract.write.sell([BigInt(countryId), amountWei, minOutWei, deadlineTime]);
        return { hash };
      } catch (error) {
        console.error('Sell transaction error:', error);
        throw new Error(translateContractError(error, 'en'));
      }
    },
    
    async attack({ fromCountryId, toCountryId, amount }: { 
      fromCountryId: number; 
      toCountryId: number; 
      amount: string;
    }) {
      try {
        const amountWei = parseUnits(amount, 18);
        
        console.log(`Attacking from country ${fromCountryId} to ${toCountryId} with ${amount} tokens`);
        
        // Get attack fee
        const feeInfo = await coreRead.getCurrentTier(toCountryId);
        const attackFee = feeInfo.attackFeeUSDC6_orETHwei;
        
        console.log(`Attack fee: ${formatUnits(attackFee, 18)} ETH`);
        
        // Simulate first
        await contract.read.attack([BigInt(fromCountryId), BigInt(toCountryId), amountWei], {
          value: attackFee
        });
        
        // Send transaction
        const hash = await contract.write.attack([BigInt(fromCountryId), BigInt(toCountryId), amountWei], {
          value: attackFee
        });
        
        return { 
          hash,
          msgValue: attackFee.toString(),
        };
      } catch (error) {
        console.error('Attack transaction error:', error);
        throw new Error(translateContractError(error, 'en'));
      }
    }
  };
}

// Utility functions
export function calculateSlippage(amount: bigint, slippageBps: number = 200): bigint {
  // 2% slippage by default
  return (amount * BigInt(10000 - slippageBps)) / BigInt(10000);
}

export function formatPrice(price8: bigint): string {
  return formatUnits(price8, 8);
}

export function formatUSDC(usdc6: bigint): string {
  return formatUnits(usdc6, 6);
}
