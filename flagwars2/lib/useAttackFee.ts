"use client"
import { useReadContract } from "wagmi"
import { CORE_ABI } from "./core-abi"

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

export function useAttackFee(attackerCountryId?: number) {
  // Read attacker's current price
  const { data: attackerInfo } = useReadContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: 'getCountryInfo',
    args: attackerCountryId !== undefined ? [BigInt(attackerCountryId)] : undefined,
    query: {
      enabled: attackerCountryId !== undefined,
      refetchInterval: 5000, // Refresh every 5s
    }
  })

  // Read config for tier parameters
  const { data: cfg } = useReadContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: 'cfg',
    query: {
      refetchInterval: 60000, // Refresh every minute (config rarely changes)
    }
  })

  if (!attackerInfo || !cfg) {
    return { delta: undefined, fee: undefined, tier: undefined, loading: true }
  }

  // cfg returns: [payToken, feeToken, treasury, revenue, commissions, buyFeeBps, sellFeeBps, referralShareBps, revenueShareBps, priceMin8, kappa, lambda, attackFeeInUSDC, tier1Price8, tier2Price8, tier3Price8, delta1_8, delta2_8, delta3_8, delta4_8, fee1_USDC6, fee2_USDC6, fee3_USDC6, fee4_USDC6, fee1_TOKEN18, fee2_TOKEN18, fee3_TOKEN18, fee4_TOKEN18]
  const price8 = attackerInfo[2] // price8 from getCountryInfo
  const attackFeeInUSDC = cfg[12] // shifted by +1 due to feeToken
  const tier1Price8 = cfg[13]
  const tier2Price8 = cfg[14]
  const tier3Price8 = cfg[15]
  const delta1_8 = cfg[16]
  const delta2_8 = cfg[17]
  const delta3_8 = cfg[18]
  const delta4_8 = cfg[19]
  const fee1_USDC6 = cfg[20]
  const fee2_USDC6 = cfg[21]
  const fee3_USDC6 = cfg[22]
  const fee4_USDC6 = cfg[23]
  const fee1_TOKEN18 = cfg[24]
  const fee2_TOKEN18 = cfg[25]
  const fee3_TOKEN18 = cfg[26]
  const fee4_TOKEN18 = cfg[27]

  let delta: bigint
  let fee: bigint
  let tier: number

  if (price8 <= tier1Price8) {
    delta = delta1_8
    fee = attackFeeInUSDC ? BigInt(fee1_USDC6) : fee1_TOKEN18
    tier = 1
  } else if (price8 <= tier2Price8) {
    delta = delta2_8
    fee = attackFeeInUSDC ? BigInt(fee2_USDC6) : fee2_TOKEN18
    tier = 2
  } else if (price8 <= tier3Price8) {
    delta = delta3_8
    fee = attackFeeInUSDC ? BigInt(fee3_USDC6) : fee3_TOKEN18
    tier = 3
  } else {
    delta = delta4_8
    fee = attackFeeInUSDC ? BigInt(fee4_USDC6) : fee4_TOKEN18
    tier = 4
  }

  return {
    delta,
    fee,
    tier,
    attackFeeInUSDC,
    loading: false
  }
}

