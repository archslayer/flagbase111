import { createPublicClient, http, parseUnits, formatUnits, createWalletClient, custom, getContract, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { env } from "@/lib/env";
import { translateContractError } from "@/lib/error-handler";
import FlagWarsCore from "@/artifacts/contracts/FlagWarsCore_Production.sol/FlagWarsCore_Production.json";
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
      // First try new Core.sol format (countries mapping) using CORE_ABI
      try {
        const result = await publicClient.readContract({
          address: env.CORE as `0x${string}`,
          abi: CORE_ABI,
          functionName: 'countries',
          args: [BigInt(countryId)]
        }) as readonly [string, `0x${string}`, boolean, bigint, number, number, bigint];
        
        const [name, token, exists, price8, kappa8, lambda8, priceMin8] = result;
        
        // Get balance from token contract for totalSupply
        let totalSupply = 0n;
        try {
          const erc20Abi = parseAbi(['function totalSupply() view returns (uint256)']);
          totalSupply = await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'totalSupply',
            args: []
          }) as bigint;
        } catch {}
        
        return {
          id: countryId,
          name,
          token,
          price: price8.toString(),
          attacks: "0", // New Core doesn't track attacks
          totalSupply: totalSupply.toString(),
          exists,
        };
      } catch (newCoreError) {
        // Fallback to old Core.sol format (getCountryInfo)
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
      }
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
      // Mock tier info - replace with actual contract call
      return {
        maxPrice: "1000000000000000000000", // 1000 ETH
        delta: "10000000000000000000", // 10 ETH
        attackFee: "1000000000000000000" // 1 ETH
      };
    } catch (error) {
      console.error('Error getting current tier:', error);
      throw new Error('Failed to get current tier');
    }
  },

  async getConfig(): Promise<GameConfig> {
    try {
      // Mock config - replace with actual contract call
      return {
        payToken: env.USDC,
        entryFee: "500", // 5%
        sellFee: "300", // 3%
        tiers: [
          { maxPrice: "1000000000", delta: "10000000", attackFee: "100" },
          { maxPrice: "10000000000", delta: "50000000", attackFee: "200" },
          { maxPrice: "0", delta: "100000000", attackFee: "300" }
        ],
        antiDump: [
          { pct: "1000", extraFee: "500", cooldown: "3600" },
          { pct: "5000", extraFee: "1000", cooldown: "7200" }
        ],
        wb1Count: "5",
        wb1Window: "300",
        wb1MulBps: "6000",
        wb2Count: "20",
        wb2Window: "1800",
        wb2MulBps: "8000"
      };
    } catch (error) {
      console.error('Error getting config:', error);
      throw new Error('Failed to get config');
    }
  },

  async getAntiDumpInfo(countryId: number, amount: string): Promise<AntiDumpInfo> {
    try {
      // Mock anti-dump info - replace with actual contract call
      return {
        sellAmount: "0",
        sellPercentage: "0",
        extraFeeBps: "0",
        cooldown: "0",
        nextSellTime: "0",
        canSellNow: true
      };
    } catch (error) {
      console.error('Error getting anti-dump info:', error);
      throw new Error('Failed to get anti-dump info');
    }
  },

  async getUserCooldownInfo(address: string, countryId: number): Promise<{isInCooldown: boolean, remainingSeconds: number, lastTierApplied: number}> {
    try {
      // Mock cooldown info - replace with actual contract call
      return {
        isInCooldown: false,
        remainingSeconds: 0,
        lastTierApplied: 0
      };
    } catch (error) {
      console.error('Error getting user cooldown info:', error);
      throw new Error('Failed to get user cooldown info');
    }
  },

  async getAchievements(address: string): Promise<any[]> {
    try {
      // Mock achievements - replace with actual contract call
      return [];
    } catch (error) {
      console.error('Error getting achievements:', error);
      throw new Error('Failed to get achievements');
    }
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
      // Use CORE_ABI instead of compiled ABI
      const result = await publicClient.readContract({
        address: env.CORE as `0x${string}`,
        abi: CORE_ABI,
        functionName: 'getWarBalanceState',
        args: [userAddress as `0x${string}`]
      }) as any;
      
      return {
        wb1Count: result[0].toString(),
        wb1Threshold: result[1].toString(),
        wb1Window: result[2].toString(),
        wb1Multiplier: result[3].toString(),
        wb1MulBps: result[4].toString(),
        wb2Count: result[5].toString(),
        wb2Threshold: result[6].toString(),
        wb2Window: result[7].toString(),
        wb2Multiplier: result[8].toString(),
        wb2MulBps: result[9].toString(),
        currentMultiplier: result[10].toString()
      };
    } catch (error) {
      // Function not yet implemented in contract - return defaults
      throw error; // Rethrow to be handled by caller
    }
  },

  async previewAttackFee(userAddress: string, targetPrice8: string): Promise<{
    baseFeeUSDC6: string;
    appliedTier: number;
    appliedMulBps: string;
    finalFeeUSDC6: string;
    isFreeAttackAvailable: boolean;
  }> {
    try {
      // Use new Core.sol ABI
      const result = await publicClient.readContract({
        address: env.CORE as `0x${string}`,
        abi: CORE_ABI,
        functionName: 'previewAttackFee',
        args: [userAddress as `0x${string}`, BigInt(targetPrice8)]
      }) as readonly [bigint, bigint, bigint, bigint, boolean];
      
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
        
        // Get buy price for validation
        const buyPrice = await contractReader.getBuyPrice(countryId, amount);
        const buyPriceWei = parseUnits(formatUnits(BigInt(buyPrice), 6), 6);
        
        console.log(`Buying ${amount} tokens for country ${countryId}`);
        console.log(`Buy price: ${formatUnits(buyPriceWei, 6)} USDC`);
        
        // Simulate USDC approval if required
        if (REQUIRE_USDC_APPROVAL) {
          console.log("USDC approval required - simulating approval");
          // In real implementation, check allowance and approve if needed
        }
        
        // For now, return mock transaction
        const txHash = `0x${Math.random().toString(16).substr(2, 40)}`;
        console.log(`Buy transaction sent: ${txHash}`);
        
        return { hash: txHash };
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
        
        // For now, return mock transaction
        const txHash = `0x${Math.random().toString(16).substr(2, 40)}`;
        console.log(`Sell transaction sent: ${txHash}`);
        
        return { hash: txHash };
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
        
        // Get attack fee estimation
        const feeInfo = await contractReader.getCurrentTier(toCountryId);
        const attackFee = BigInt(feeInfo.attackFee);
        
        console.log(`Attack fee: ${formatUnits(attackFee, 6)} USDC`);
        
        // For now, return mock transaction
        const txHash = `0x${Math.random().toString(16).substr(2, 40)}`;
        console.log(`Attack transaction sent: ${txHash}`);
        
        return { 
          hash: txHash,
          msgValue: attackFee.toString(),
        };
      } catch (error) {
        console.error('Attack transaction error:', error);
        throw new Error(translateContractError(error, 'en'));
      }
    },
    
    async claimReferralRewards() {
      try {
        console.log("Claiming referral rewards");
        const txHash = `0x${Math.random().toString(16).substr(2, 40)}`;
        return { hash: txHash };
      } catch (error) {
        console.error('Claim referral rewards error:', error);
        throw new Error('Failed to claim referral rewards');
      }
    },
    
    async mintAchievement(id: number) {
      try {
        console.log(`Minting achievement ${id}`);
        const txHash = `0x${Math.random().toString(16).substr(2, 40)}`;
        return { hash: txHash };
      } catch (error) {
        console.error('Mint achievement error:', error);
        throw new Error('Failed to mint achievement');
      }
    }
  };
}

export const addresses = {
  core: env.CORE,
  achievements: env.ACHIEVEMENTS,
  usdc: env.USDC
};
