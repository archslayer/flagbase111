import 'server-only'

// ════════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT SYSTEM SCHEMAS
// ════════════════════════════════════════════════════════════════════════════════

export const ACHV_COLLECTIONS = {
  DEFS: 'achv_defs',
  PROGRESS: 'achv_progress',
  MINTS: 'achv_mints',
} as const

// ════════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT DEFINITIONS (Categories & Levels)
// ════════════════════════════════════════════════════════════════════════════════

export interface AchievementDefinition {
  _id?: any
  category: number        // 1: AttackCount, 2: MultiCountryAttack, 3: ReferralCount, 5: FlagCount
  key: string             // "ATTACK_COUNT", "MULTI_COUNTRY", "REFERRAL_COUNT", "FLAG_COUNT"
  title: string           // "Attack Count", "Multi-Country Attack", etc.
  description: string
  levels: number[]        // [1, 10, 100, 1000] - achievement thresholds
  imageBaseURI: string    // base image prefix for metadata
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

// ════════════════════════════════════════════════════════════════════════════════
// USER PROGRESS (Metrics + Earned + Minted)
// ════════════════════════════════════════════════════════════════════════════════

export interface AchievementProgress {
  _id?: any
  userId: string          // checksummed wallet address

  // Raw metrics
  totalAttacks: number
  distinctCountriesAttacked: number
  referralCount: number
  flagCount: number       // number of total flags owned (for category 5)

  // Earned levels (idempotent) - { "1": [1, 10, 100], "2": [1, 5] }
  earned: Record<string, number[]>

  // Minted levels (confirmed on-chain) - { "1": [1, 10], "2": [] }
  minted: Record<string, number[]>

  updatedAt: Date
  createdAt: Date
}

// ════════════════════════════════════════════════════════════════════════════════
// MINT RECORDS (Off-chain audit + quick UI)
// ════════════════════════════════════════════════════════════════════════════════

export interface AchievementMint {
  _id?: any
  userId: string
  category: number
  level: number
  tokenId?: string        // on-chain tokenId (after confirmation)
  txHash: string
  mintedAt: Date
  priceUSDC6: string      // "200000"
  status: 'pending' | 'confirmed' | 'failed'
  error?: string
  confirmedAt?: Date
}

// ════════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT CATEGORIES (Enum)
// ════════════════════════════════════════════════════════════════════════════════

export enum AchievementCategory {
  ATTACK_COUNT = 1,
  MULTI_COUNTRY = 2,
  REFERRAL_COUNT = 3,
  FLAG_COUNT = 5,
}

export const CATEGORY_KEYS: Record<number, string> = {
  [AchievementCategory.ATTACK_COUNT]: 'ATTACK_COUNT',
  [AchievementCategory.MULTI_COUNTRY]: 'MULTI_COUNTRY',
  [AchievementCategory.REFERRAL_COUNT]: 'REFERRAL_COUNT',
  [AchievementCategory.FLAG_COUNT]: 'FLAG_COUNT',
}

// ════════════════════════════════════════════════════════════════════════════════
// THRESHOLDS (Server-side validation)
// ════════════════════════════════════════════════════════════════════════════════

export const ACHIEVEMENT_THRESHOLDS: Record<number, number[]> = {
  [AchievementCategory.ATTACK_COUNT]: [1, 10, 100, 1000],
  [AchievementCategory.MULTI_COUNTRY]: [1, 5, 15, 35],
  [AchievementCategory.REFERRAL_COUNT]: [1, 10, 100, 1000],
  [AchievementCategory.FLAG_COUNT]: [5, 50, 250, 500],
}

// ════════════════════════════════════════════════════════════════════════════════
// SEED DATA (Initial achievement definitions)
// ════════════════════════════════════════════════════════════════════════════════

export const INITIAL_ACHIEVEMENT_DEFS: Omit<AchievementDefinition, '_id' | 'createdAt' | 'updatedAt'>[] = [
  {
    category: AchievementCategory.ATTACK_COUNT,
    key: 'ATTACK_COUNT',
    title: 'Attack Count',
    description: 'Total number of attacks launched',
    levels: ACHIEVEMENT_THRESHOLDS[AchievementCategory.ATTACK_COUNT],
    imageBaseURI: '/achievements/attack_count',
    enabled: true,
  },
  {
    category: AchievementCategory.MULTI_COUNTRY,
    key: 'MULTI_COUNTRY',
    title: 'Multi-Country Attack',
    description: 'Number of distinct countries attacked',
    levels: ACHIEVEMENT_THRESHOLDS[AchievementCategory.MULTI_COUNTRY],
    imageBaseURI: '/achievements/multi_country',
    enabled: true,
  },
  {
    category: AchievementCategory.REFERRAL_COUNT,
    key: 'REFERRAL_COUNT',
    title: 'Referral Count',
    description: 'Number of successful referrals',
    levels: ACHIEVEMENT_THRESHOLDS[AchievementCategory.REFERRAL_COUNT],
    imageBaseURI: '/achievements/referral_count',
    enabled: true,
  },
  {
    category: AchievementCategory.FLAG_COUNT,
    key: 'FLAG_COUNT',
    title: 'Number of Total Flags',
    description: 'Total number of flags owned simultaneously',
    levels: ACHIEVEMENT_THRESHOLDS[AchievementCategory.FLAG_COUNT],
    imageBaseURI: '/achievements/flag_count',
    enabled: true,
  },
]

