/**
 * Attack flow utilities for FlagWars
 * Handles attack calculations, user balances, and fee estimations
 */

import { formatUnits, parseUnits } from "viem";
import { contractReader } from "./contracts";
import { countryFlagUrl, countryName, getAllCountryFlags } from "./flags";

const TOKEN_DECIMALS = 18;
const USDC_DECIMALS = 6;

export interface AttackItem {
  id: number;
  name: string;
  flagUrl: string;
  balance?: string; // For attacker list
  price?: string;   // For attacked list
}

export interface AttackFeeInfo {
  baseFee: string;
  finalFee: string;
  wb1Multiplier: string;
  wb2Multiplier: string;
  isFreeAttack: boolean;
  freeAttacksUsed: number;
  freeAttacksRemaining: number;
}

/**
 * Get list of countries the user owns (attacker list)
 */
export async function getAttackerList(userAddress: string): Promise<AttackItem[]> {
  try {
    const allCountries = getAllCountryFlags();
    const attackerList: AttackItem[] = [];

    for (const country of allCountries) {
      try {
        // Try new Core.sol format first (countries mapping), fallback to old getCountryInfo
        let countryInfo;
        try {
          countryInfo = await contractReader.getCountryInfo(country.id);
          if (!countryInfo.exists) continue;
        } catch (e) {
          // Country doesn't exist on contract
          continue;
        }

        // Get user balance from contract
        const userBalance = await contractReader.getUserBalance(userAddress, country.id);
        
        if (BigInt(userBalance) > 0n) {
          attackerList.push({
            id: country.id,
            name: country.name,
            flagUrl: country.flagUrl,
            balance: formatUnits(BigInt(userBalance), TOKEN_DECIMALS)
          });
        }
      } catch (error) {
        console.warn(`Failed to check balance for country ${country.id}:`, error);
        continue;
      }
    }

    return attackerList;
  } catch (error) {
    console.error('Error getting attacker list:', error);
    return [];
  }
}

/**
 * Get list of countries that can be attacked (all except attacker)
 */
export async function getAttackedList(attackerId: number | null): Promise<AttackItem[]> {
  try {
    const allCountries = getAllCountryFlags();
    const attackedList: AttackItem[] = [];

    for (const country of allCountries) {
      // Skip if this is the attacker country
      if (attackerId && country.id === attackerId) continue;

      try {
        // Try new Core.sol format first (countries mapping), fallback to old getCountryInfo
        let countryInfo;
        try {
          countryInfo = await contractReader.getCountryInfo(country.id);
          if (!countryInfo.exists) continue;
        } catch (e) {
          // Country doesn't exist on contract
          continue;
        }

        attackedList.push({
          id: country.id,
          name: country.name,
          flagUrl: country.flagUrl,
          price: formatUnits(BigInt(countryInfo.price), USDC_DECIMALS)
        });
      } catch (error) {
        console.warn(`Failed to get info for country ${country.id}:`, error);
        continue;
      }
    }

    return attackedList;
  } catch (error) {
    console.error('Error getting attacked list:', error);
    return [];
  }
}

/**
 * Estimate attack fee with WB multipliers (using contract preview)
 */
export async function estimateAttackFee(
  fromId: number,
  toId: number,
  userAddress: string
): Promise<AttackFeeInfo> {
  try {
    // Get attacker country price (not target) - try new Core.sol format first
    let attackerInfo;
    try {
      attackerInfo = await contractReader.getCountryInfo(fromId);
      if (!attackerInfo.exists) {
        throw new Error('Attacker country does not exist');
      }
    } catch (e: any) {
      throw new Error('Attacker country does not exist');
    }
    
    // ALWAYS use client-side calculation to ensure correct tier (contract has outdated tiers)
    const attackerPrice8 = BigInt(attackerInfo.price)
    
    // Correct tier thresholds from spec (price8 format: USDC * 1e8):
    // Tier 1: ≤ 5 USDC (5e8) → 0.30 USDC, delta 0.0013
    // Tier 2: 5.000001 - 10 USDC (5e8 < price ≤ 10e8) → 0.35 USDC, delta 0.0011
    // Tier 3: > 10 USDC (> 10e8) → 0.40 USDC, delta 0.0009
    let baseFee: bigint
    let tier: number
    
    if (attackerPrice8 > 10e8) {
      // Tier 3: > 10 USDC
      tier = 3
      baseFee = 400_000n // 0.40 USDC (6 decimals)
    } else if (attackerPrice8 > 5e8) {
      // Tier 2: 5.000001 - 10 USDC
      tier = 2
      baseFee = 350_000n // 0.35 USDC
    } else {
      // Tier 1: ≤ 5 USDC
      tier = 1
      baseFee = 300_000n // 0.30 USDC
    }
    
    // No WB multipliers for now (TODO: Implement WB system)
    const wb1Multiplier = "10000" // No bonus
    const wb2Multiplier = "10000" // No bonus
    
    // Get free attacks from contract
    let freeAttacksUsed = 0
    let freeAttacksRemaining = 2
    try {
      const freeAttackCount = await contractReader.getFreeAttackCount(userAddress)
      freeAttacksUsed = freeAttackCount.used
      freeAttacksRemaining = freeAttackCount.remaining
    } catch (freeError) {
      // Silently ignore - using default values
      console.log('getFreeAttackCount failed, using defaults:', freeError)
    }
    
    return {
      baseFee: baseFee.toString(),
      finalFee: baseFee.toString(),
      wb1Multiplier,
      wb2Multiplier,
      isFreeAttack: false,
      freeAttacksUsed,
      freeAttacksRemaining
    }
    
    /* OLD CODE - Contract-based calculation (disabled until contract is updated)
    try {
      // Try contract preview function first (using attacker's price)
      // previewAttackFee uses attacker's country price (8 decimals), not target
      const preview = await contractReader.previewAttackFee(userAddress, attackerInfo.price.toString());
      
      // Calculate multipliers for display
      // appliedMulBps = 0 means no bonus, > 0 means bonus applied (e.g., 1000 = 10% bonus)
      const wb1Multiplier = preview.appliedTier === 1 && parseInt(preview.appliedMulBps) > 0 
        ? String(10000 + parseInt(preview.appliedMulBps)) 
        : "10000";
      const wb2Multiplier = preview.appliedTier === 2 && parseInt(preview.appliedMulBps) > 0 
        ? String(10000 + parseInt(preview.appliedMulBps)) 
        : "10000";

      // Get war balance state for free attacks
      let freeAttacksUsed = 0;
      let freeAttacksRemaining = 2;
      try {
        const wbState = await contractReader.getWarBalanceState(userAddress);
        freeAttacksUsed = parseInt(wbState.wb1Count); // This should be freeAttacksUsed from contract
        freeAttacksRemaining = Math.max(0, 2 - freeAttacksUsed);
      } catch (wbError) {
        // War balance state not available, use defaults
        console.log('War balance state not available, using defaults:', wbError);
      }

      return {
        baseFee: preview.baseFeeUSDC6,
        finalFee: preview.finalFeeUSDC6,
        wb1Multiplier,
        wb2Multiplier,
        isFreeAttack: preview.isFreeAttackAvailable,
        freeAttacksUsed,
        freeAttacksRemaining
      };
    } catch (previewError) {
      console.log('previewAttackFee failed, using API config:', previewError)
    */
  } catch (error) {
    console.error('Error estimating attack fee:', error);
    return {
      baseFee: "0",
      finalFee: "0",
      wb1Multiplier: "10000",
      wb2Multiplier: "10000",
      isFreeAttack: false,
      freeAttacksUsed: 0,
      freeAttacksRemaining: 0
    };
  }
}

/**
 * Check if attack is valid (floor price, sufficient balance, etc.)
 */
export async function validateAttack(
  attackerId: number,
  attackedId: number,
  amountStr: string
): Promise<{ isValid: boolean; reason?: string }> {
  try {
    // Check if both countries exist - try new Core.sol format first
    let attackerInfo, attackedInfo;
    try {
      attackerInfo = await contractReader.getCountryInfo(attackerId);
    } catch (e) {
      return { isValid: false, reason: "Attacker country does not exist" };
    }
    try {
      attackedInfo = await contractReader.getCountryInfo(attackedId);
    } catch (e) {
      return { isValid: false, reason: "Attacked country does not exist" };
    }

    if (!attackerInfo.exists) {
      return { isValid: false, reason: "Attacker country does not exist" };
    }

    if (!attackedInfo.exists) {
      return { isValid: false, reason: "Attacked country does not exist" };
    }

    // Check floor price (attacked country)
    const config = await contractReader.getConfig();
    const attackedPrice = BigInt(attackedInfo.price);
    const priceMin = parseUnits("0.01", USDC_DECIMALS); // 0.01 USDC minimum

    if (attackedPrice <= priceMin) {
      return { isValid: false, reason: "Attack disabled: floor price reached" };
    }

    // TODO: Check user balance
    // const userBalance = await contractReader.getUserBalance(userAddress, attackerId);
    // const amountWei = parseUnits(amountStr, TOKEN_DECIMALS);
    // if (BigInt(userBalance) < amountWei) {
    //   return { isValid: false, reason: "Insufficient FLAG balance" };
    // }

    return { isValid: true };
  } catch (error) {
    console.error('Error validating attack:', error);
    return { isValid: false, reason: "Validation failed" };
  }
}

/**
 * Format attack fee for display
 */
export function formatAttackFee(feeWei: string): string {
  try {
    const feeBigInt = BigInt(feeWei);
    if (feeBigInt === BigInt(0)) return "Free";
    
    const feeUSDC = formatUnits(feeBigInt, USDC_DECIMALS);
    return `${parseFloat(feeUSDC).toFixed(2)} USDC`;
  } catch (error) {
    return "Unknown";
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amountWei: string): string {
  try {
    const amountBigInt = BigInt(amountWei);
    const amount = formatUnits(amountBigInt, TOKEN_DECIMALS);
    return parseFloat(amount).toFixed(4);
  } catch (error) {
    return "0";
  }
}
