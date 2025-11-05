/**
 * Client-side attack tier calculation (no extra RPC needed)
 * Takes attacker's current price8 and config, returns delta + fee
 */

export interface AttackConfig {
  attackFeeInUSDC: boolean
  tier1Price8: bigint
  tier2Price8: bigint
  tier3Price8: bigint
  delta1_8: bigint
  delta2_8: bigint
  delta3_8: bigint
  delta4_8: bigint
  fee1_USDC6: number
  fee2_USDC6: number
  fee3_USDC6: number
  fee4_USDC6: number
  fee1_TOKEN18: bigint
  fee2_TOKEN18: bigint
  fee3_TOKEN18: bigint
  fee4_TOKEN18: bigint
}

export interface TierResult {
  tier: number
  delta8: bigint
  fee: bigint
  isUSDC: boolean
}

export function computeAttackTier(price8: bigint, cfg: AttackConfig): TierResult {
  const { attackFeeInUSDC } = cfg

  if (price8 <= cfg.tier1Price8) {
    return {
      tier: 1,
      delta8: cfg.delta1_8,
      fee: attackFeeInUSDC ? BigInt(cfg.fee1_USDC6) : cfg.fee1_TOKEN18,
      isUSDC: attackFeeInUSDC
    }
  }

  if (price8 <= cfg.tier2Price8) {
    return {
      tier: 2,
      delta8: cfg.delta2_8,
      fee: attackFeeInUSDC ? BigInt(cfg.fee2_USDC6) : cfg.fee2_TOKEN18,
      isUSDC: attackFeeInUSDC
    }
  }

  if (price8 <= cfg.tier3Price8) {
    return {
      tier: 3,
      delta8: cfg.delta3_8,
      fee: attackFeeInUSDC ? BigInt(cfg.fee3_USDC6) : cfg.fee3_TOKEN18,
      isUSDC: attackFeeInUSDC
    }
  }

  return {
    tier: 4,
    delta8: cfg.delta4_8,
    fee: attackFeeInUSDC ? BigInt(cfg.fee4_USDC6) : cfg.fee4_TOKEN18,
    isUSDC: attackFeeInUSDC
  }
}

