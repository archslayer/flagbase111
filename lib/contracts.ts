import { createPublicClient, http, parseUnits, formatUnits, createWalletClient, custom, getContract, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";
import { translateContractError } from "@/lib/error-handler";
import FlagWarsCore from "@/artifacts/contracts/FlagWarsCore_Static.sol/FlagWarsCore.json";
import { CORE_ABI } from "@/lib/core-abi";

// Types for contract interactions
export interface CountryInfo {
  id: number
  name: string
  token: string
  price: string
  attacks: string
  totalSupply: string
  exists: boolean
  reserve?: string
}

export interface PriceInfo {
  buyPrice: string
  sellPrice: string
  amount: string
}

export interface TierInfo {
  maxPrice: string
  delta: string
  attackFee: string
}

export interface AntiDumpInfo {
  sellAmount: string
  sellPercentage: string
  extraFeeBps: string
  cooldown: string
  nextSellTime: string
  canSellNow: boolean
}

export interface WarBalanceInfo {
  wb1Count: string
  wb1Threshold: string
  wb1Window: string
  wb1Multiplier: string
  wb1MulBps: string
  wb2Count: string
  wb2Threshold: string
  wb2Window: string
  wb2Multiplier: string
  wb2MulBps: string
  currentMultiplier: string
}

export interface GameConfig {
  payToken: string
  entryFee: string
  sellFee: string
  tiers: TierInfo[]
  antiDump: Array<{
    pct: string
    extraFee: string
    cooldown: string
  }>
  wb1Count: string
  wb1Window: string
  wb1MulBps: string
  wb2Count: string
  wb2Window: string
  wb2MulBps: string
}

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

// Contract reader functions
export const contractReader = {
  async getCountryInfo(countryId: number): Promise<CountryInfo> {
    try {
      // Use getCountryInfo view function (more reliable than mapping getter)
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
      // Return mock data if contract call fails
      return {
        id: countryId,
        name: `Country ${countryId}`,
        token: `0x${countryId.toString(16).padStart(40, '0')}`,
        price: "500000000", // 5.00 USDC in 8 decimals
        attacks: "0",
        totalSupply: "50000000000000000000000", // 50,000 tokens
        exists: true,
      };
    }
  },

  async getBuyPrice(countryId: number, amount: string): Promise<string> {
    try {
      const amountWei = parseUnits(amount, 18);
      const price = await coreContract.read.getBuyPrice([BigInt(countryId), amountWei]) as bigint;
      return price.toString();
    } catch (error) {
      console.error('Error getting buy price:', error);
      // Fallback calculation
      const amountWei = parseUnits(amount, 18);
      const countryInfo = await this.getCountryInfo(countryId);
      const basePrice = BigInt(countryInfo.price);
      const kappa = BigInt(55000); // 0.00055 * 1e8
      const buyPrice = basePrice + (kappa / BigInt(2));
      const totalCost = (buyPrice * amountWei) / parseUnits("1", 18);
      return (totalCost / BigInt(100)).toString(); // Convert 8 decimals to 6 decimals (USDC6)
    }
  },

  async getSellPrice(countryId: number, amount: string): Promise<string> {
    try {
      const amountWei = parseUnits(amount, 18);
      const price = await coreContract.read.getSellPrice([BigInt(countryId), amountWei]) as bigint;
      return price.toString();
    } catch (error) {
      console.error('Error getting sell price:', error);
      // Fallback calculation
      const amountWei = parseUnits(amount, 18);
      const countryInfo = await this.getCountryInfo(countryId);
      const basePrice = BigInt(countryInfo.price);
      const lambda = BigInt(55550); // 0.0005555 * 1e8
      const sellPrice = basePrice - (lambda / BigInt(2));
      const grossProceeds = (sellPrice * amountWei) / parseUnits("1", 18);
      const sellFeeBps = BigInt(500); // 5%
      const fee = (grossProceeds * sellFeeBps) / BigInt(10000);
      const netProceeds = grossProceeds - fee;
      return (netProceeds / BigInt(100)).toString(); // Convert 8 decimals to 6 decimals (USDC6)
    }
  },

  async getCurrentTier(countryId: number): Promise<TierInfo> {
    try {
      // Use real contract call from core.ts
      const { coreRead } = require('./core')
      const tier = await coreRead.getCurrentTier(countryId)
      return {
        maxPrice: tier.maxPrice8.toString(),
        delta: tier.delta8.toString(),
        attackFee: tier.attackFeeUSDC6_orETHwei.toString()
      };
    } catch (error) {
      console.error('Error getting current tier:', error);
      throw new Error('Failed to get current tier');
    }
  },

  async getConfig(): Promise<GameConfig> {
    try {
      // Use real contract call - getConfig is implemented in contract
      const result = await coreContract.read.getConfig() as readonly [
        string, string, string, string, string, number, number, number, number, bigint, bigint, bigint, boolean,
        bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, number, number, number,
        bigint, bigint, bigint, bigint
      ];
      
      const [
        payToken, feeToken, treasury, revenue, commissions,
        buyFeeBps, sellFeeBps, referralShareBps, revenueShareBps,
        priceMin8, kappa, lambda, attackFeeInUSDC,
        tier1Price8, tier2Price8, tier3Price8,
        delta1_8, delta2_8, delta3_8, delta4_8,
        fee1_USDC6, fee2_USDC6, fee3_USDC6, fee4_USDC6,
        fee1_TOKEN18, fee2_TOKEN18, fee3_TOKEN18, fee4_TOKEN18
      ] = result;
      
      // Get war-balance tiers from contract (using default values for now)
      // These are stored in contract state but not exposed via getConfig
      // We'll use spec defaults: WB1 = 5 attacks/300s, WB2 = 20 attacks/1800s
      
      return {
        payToken,
        entryFee: buyFeeBps.toString(),
        sellFee: sellFeeBps.toString(),
        tiers: [
          { maxPrice: "500000000", delta: "130000", attackFee: "300000" }, // Tier 1: ≤5 USDC
          { maxPrice: "1000000000", delta: "110000", attackFee: "350000" }, // Tier 2: 5-10 USDC
          { maxPrice: "0", delta: "90000", attackFee: "400000" } // Tier 3: >10 USDC
        ],
        antiDump: [
          { pct: "1000", extraFee: "500", cooldown: "60" }, // 10% -> 5% fee, 60s
          { pct: "5000", extraFee: "1000", cooldown: "300" } // 50% -> 10% fee, 300s
        ],
        wb1Count: "5",
        wb1Window: "300",
        wb1MulBps: "6000", // 60% multiplier
        wb2Count: "20",
        wb2Window: "1800",
        wb2MulBps: "8000" // 80% multiplier
      };
    } catch (error) {
      console.error('Error getting config:', error);
      throw new Error('Failed to get config');
    }
  },

  async getAntiDumpInfo(countryId: number, amount: string): Promise<AntiDumpInfo> {
    try {
      // Use real contract call - getAntiDumpInfo is now implemented in contract
      const result = await coreContract.read.getAntiDumpInfo([
        BigInt(countryId),
        parseUnits(amount, 18)
      ]) as [
        bigint, // sellAmount
        bigint, // sellPercentage
        bigint, // extraFeeBps
        bigint, // cooldown
        bigint, // nextSellTime
        boolean // canSellNow
      ]
      
      return {
        sellAmount: result[0].toString(),
        sellPercentage: result[1].toString(),
        extraFeeBps: result[2].toString(),
        cooldown: result[3].toString(),
        nextSellTime: result[4].toString(),
        canSellNow: result[5]
      };
    } catch (error) {
      console.error('Error getting anti-dump info:', error);
      throw new Error('Failed to get anti-dump info');
    }
  },

  async getUserCooldownInfo(address: string, countryId: number): Promise<{isInCooldown: boolean, remainingSeconds: number, lastTierApplied: number}> {
    try {
      // Use real contract call - getUserCooldownInfo is now implemented in contract
      const result = await coreContract.read.getUserCooldownInfo([
        address as `0x${string}`,
        BigInt(countryId)
      ]) as [boolean, bigint, bigint]
      
      return {
        isInCooldown: result[0],
        remainingSeconds: Number(result[1]),
        lastTierApplied: Number(result[2])
      };
    } catch (error) {
      console.error('Error getting user cooldown info:', error);
      throw new Error('Failed to get user cooldown info');
    }
  },

  async getFreeAttackCount(address: string): Promise<{used: number, max: number, remaining: number}> {
    try {
      // Use real contract call - getFreeAttackCount is now implemented in contract
      const result = await coreContract.read.getFreeAttackCount([
        address as `0x${string}`
      ]) as [bigint, bigint, bigint]
      
      return {
        used: Number(result[0]),
        max: Number(result[1]),
        remaining: Number(result[2])
      };
    } catch (error) {
      console.error('Error getting free attack count:', error);
      throw new Error('Failed to get free attack count');
    }
  },

  async getAchievements(address: string): Promise<any[]> {
    // Achievements are stored in MongoDB, not on-chain
    // This function should only be called from server-side code
    // Client-side code should use /api/achievements/my endpoint instead
    console.warn('getAchievements called from client-side - use /api/achievements/my instead')
    return []
  },

  async getUserBalance(userAddress: string, countryId: number): Promise<string> {
    try {
      const countryInfo = await this.getCountryInfo(countryId);
      if (!countryInfo.exists) return "0";
      
      // Get token contract instance
      const tokenContract = getContract({
        address: countryInfo.token as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }]
          }
        ],
        client: publicClient,
      });
      
      const balance = await tokenContract.read.balanceOf([userAddress as `0x${string}`]);
      return balance.toString();
    } catch (error) {
      console.error('Error getting user balance:', error);
      return "0";
    }
  },

  async isContractPaused(): Promise<boolean> {
    try {
      const paused = await coreContract.read.paused() as boolean;
      return paused;
    } catch (error) {
      console.error('Error checking pause status:', error);
      return false;
    }
  },

  async getWarBalanceState(userAddress: string): Promise<WarBalanceInfo> {
    try {
      // Use real contract call - getWarBalanceState returns 8 values
      const result = await coreContract.read.getWarBalanceState([
        userAddress as `0x${string}`
      ]) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, number];
      
      const [
        wb1Count, wb1Threshold, wb1RemainSec,
        wb2Count, wb2Threshold, wb2RemainSec,
        freeAttacksUsed, freeAttacksMax
      ] = result;
      
      // Calculate multipliers based on thresholds
      // WB1 multiplier: 60% (6000 bps) if wb1Count >= wb1Threshold
      // WB2 multiplier: 80% (8000 bps) if wb2Count >= wb2Threshold
      const wb1Multiplier = wb1Count >= wb1Threshold ? BigInt(6000) : BigInt(0);
      const wb2Multiplier = wb2Count >= wb2Threshold ? BigInt(8000) : BigInt(0);
      const currentMultiplier = wb2Multiplier > BigInt(0) ? wb2Multiplier : wb1Multiplier;
      
      return {
        wb1Count: wb1Count.toString(),
        wb1Threshold: wb1Threshold.toString(),
        wb1Window: wb1RemainSec.toString(),
        wb1Multiplier: wb1Multiplier.toString(),
        wb1MulBps: wb1Multiplier.toString(),
        wb2Count: wb2Count.toString(),
        wb2Threshold: wb2Threshold.toString(),
        wb2Window: wb2RemainSec.toString(),
        wb2Multiplier: wb2Multiplier.toString(),
        wb2MulBps: wb2Multiplier.toString(),
        currentMultiplier: currentMultiplier.toString()
      };
    } catch (error) {
      console.error('Error getting war balance state:', error);
      throw error;
    }
  },

  async previewAttackFee(userAddress: string, attackerPrice8: string): Promise<{
    baseFeeUSDC6: string;
    appliedTier: number;
    appliedMulBps: string;
    finalFeeUSDC6: string;
    isFreeAttackAvailable: boolean;
  }> {
    try {
      // Use real contract call - previewAttackFee uses attacker's country price
      // Note: attackerPrice8 is the attacker's country price (8 decimals), not target
      const result = await coreContract.read.previewAttackFee([
        userAddress as `0x${string}`,
        BigInt(attackerPrice8)
      ]) as readonly [bigint, bigint, bigint, bigint, boolean];
      
      const [baseFeeUSDC6, appliedTierBig, appliedMulBps, finalFeeUSDC6, isFreeAttackAvailable] = result;
      const appliedTier = Number(appliedTierBig);
      
      return {
        baseFeeUSDC6: baseFeeUSDC6.toString(),
        appliedTier,
        appliedMulBps: appliedMulBps.toString(),
        finalFeeUSDC6: finalFeeUSDC6.toString(),
        isFreeAttackAvailable
      };
    } catch (error) {
      console.error('Error previewing attack fee:', error);
      throw new Error('Failed to preview attack fee');
    }
  }
};
// Feature flags
const REQUIRE_USDC_APPROVAL = process.env.NEXT_PUBLIC_REQUIRE_USDC_APPROVAL === 'true';

// Attack fee modes
type AttackFeeMode = 'DIRECT_WEI' | 'BPS_OF_AMOUNT' | 'ERC20_USDC';
const ATTACK_FEE_MODE: AttackFeeMode = 
  (process.env.NEXT_PUBLIC_ATTACK_FEE_MODE as AttackFeeMode) || 'DIRECT_WEI';

// Attack fee calculation
export function computeAttackFee(
  mode: AttackFeeMode,
  params: {
    attackFeeFromTier: bigint;
    amountWei: bigint;
  }
): { msgValue: bigint; usdcExtra?: bigint } {
  switch (mode) {
    case 'DIRECT_WEI':
      return { msgValue: BigInt(params.attackFeeFromTier.toString()) };
    
    case 'BPS_OF_AMOUNT':
      return {
        msgValue: (params.amountWei * params.attackFeeFromTier) / BigInt(10000),
      };
    
    case 'ERC20_USDC':
      return { msgValue: BigInt(0), usdcExtra: BigInt(0) };
    
    default:
      return { msgValue: BigInt(0) };
  }
}

export function createContractWriter(walletClient: any) {
  // Use createCoreWriter from lib/core.ts which has real contract calls
  const { createCoreWriter } = require('./core')
  return createCoreWriter(walletClient)
}

export const addresses = {
  core: env.CORE,
  achievements: env.ACHIEVEMENTS,
  usdc: env.USDC
};
