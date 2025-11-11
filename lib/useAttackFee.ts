"use client"
import { useReadContract } from "wagmi"
import { CORE_ABI } from "./core-abi"
import { useEffect, useState } from "react"

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

// Default config values (fallback if API fails)
const DEFAULT_CONFIG = {
  attackFeeInUSDC: true,
  tier1Price8: BigInt("100000000"),     // 1 USDC
  tier2Price8: BigInt("1000000000"),    // 10 USDC
  tier3Price8: BigInt("10000000000"),   // 100 USDC
  delta1_8: 0n,
  delta2_8: 0n,
  delta3_8: 0n,
  delta4_8: 0n,
  fee1_USDC6: 100000,  // 0.1 USDC
  fee2_USDC6: 500000,  // 0.5 USDC
  fee3_USDC6: 1000000, // 1 USDC
  fee4_USDC6: 2000000, // 2 USDC
  fee1_TOKEN18: 0n,
  fee2_TOKEN18: 0n,
  fee3_TOKEN18: 0n,
  fee4_TOKEN18: 0n,
}

export function useAttackFee(attackerCountryId?: number) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  
  // Fetch config from API
  useEffect(() => {
    fetch('/api/config/attack')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.config) {
          setConfig({
            attackFeeInUSDC: data.config.attackFeeInUSDC,
            tier1Price8: BigInt(data.config.tier1Price8),
            tier2Price8: BigInt(data.config.tier2Price8),
            tier3Price8: BigInt(data.config.tier3Price8),
            delta1_8: BigInt(data.config.delta1_8),
            delta2_8: BigInt(data.config.delta2_8),
            delta3_8: BigInt(data.config.delta3_8),
            delta4_8: BigInt(data.config.delta4_8),
            fee1_USDC6: data.config.fee1_USDC6,
            fee2_USDC6: data.config.fee2_USDC6,
            fee3_USDC6: data.config.fee3_USDC6,
            fee4_USDC6: data.config.fee4_USDC6,
            fee1_TOKEN18: BigInt(data.config.fee1_TOKEN18),
            fee2_TOKEN18: BigInt(data.config.fee2_TOKEN18),
            fee3_TOKEN18: BigInt(data.config.fee3_TOKEN18),
            fee4_TOKEN18: BigInt(data.config.fee4_TOKEN18),
          })
        }
      })
      .catch(() => {
        // Use defaults on error
      })
  }, [])

  // Read attacker's current price
  const { data: attackerInfo } = useReadContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: 'countries',
    args: attackerCountryId !== undefined ? [BigInt(attackerCountryId)] : undefined,
    query: {
      enabled: attackerCountryId !== undefined,
      refetchInterval: 5000, // Refresh every 5s
    }
  })

  if (!attackerInfo) {
    return { delta: undefined, fee: undefined, tier: undefined, loading: true }
  }

  // countries returns: [name, token, exists, price8, kappa8, lambda8, priceMin8]
  const price8 = attackerInfo[3] as bigint // price8 from countries (index 3)
  const attackFeeInUSDC = config.attackFeeInUSDC
  const tier1Price8 = config.tier1Price8
  const tier2Price8 = config.tier2Price8
  const tier3Price8 = config.tier3Price8
  const delta1_8 = config.delta1_8
  const delta2_8 = config.delta2_8
  const delta3_8 = config.delta3_8
  const delta4_8 = config.delta4_8
  const fee1_USDC6 = config.fee1_USDC6
  const fee2_USDC6 = config.fee2_USDC6
  const fee3_USDC6 = config.fee3_USDC6
  const fee4_USDC6 = config.fee4_USDC6
  const fee1_TOKEN18 = config.fee1_TOKEN18
  const fee2_TOKEN18 = config.fee2_TOKEN18
  const fee3_TOKEN18 = config.fee3_TOKEN18
  const fee4_TOKEN18 = config.fee4_TOKEN18

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

