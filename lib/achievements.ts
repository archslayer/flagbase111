import 'server-only'
import { getDb } from './mongodb'
import { getAddress } from 'viem'
import {
  ACHV_COLLECTIONS,
  AchievementCategory,
  ACHIEVEMENT_THRESHOLDS,
  type AchievementProgress,
  type AchievementDefinition,
} from './schemas/achievements'

// ════════════════════════════════════════════════════════════════════════════════
// THRESHOLD CALCULATION (Server-side validation)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Calculate earned levels for a given category based on current metric value
 */
export function calculateEarnedLevels(category: number, currentValue: number): number[] {
  const thresholds = ACHIEVEMENT_THRESHOLDS[category]
  if (!thresholds) return []
  return thresholds.filter(threshold => currentValue >= threshold)
}

/**
 * Get all earned levels across all categories based on user's current metrics
 */
export function calculateAllEarnedLevels(progress: {
  totalAttacks: number
  distinctCountriesAttacked: number
  referralCount: number
  flagCount: number
}): Record<string, number[]> {
  return {
    [AchievementCategory.ATTACK_COUNT]: calculateEarnedLevels(
      AchievementCategory.ATTACK_COUNT,
      progress.totalAttacks
    ),
    [AchievementCategory.MULTI_COUNTRY]: calculateEarnedLevels(
      AchievementCategory.MULTI_COUNTRY,
      progress.distinctCountriesAttacked
    ),
    [AchievementCategory.REFERRAL_COUNT]: calculateEarnedLevels(
      AchievementCategory.REFERRAL_COUNT,
      progress.referralCount
    ),
    [AchievementCategory.FLAG_COUNT]: calculateEarnedLevels(
      AchievementCategory.FLAG_COUNT,
      progress.flagCount
    ),
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Get or create user's achievement progress document
 */
export async function getOrCreateProgress(userId: string): Promise<AchievementProgress> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  const existing = await collection.findOne({ userId: checksummed })
  if (existing) return existing

  // Create new progress document
  const newProgress: AchievementProgress = {
    userId: checksummed,
    totalAttacks: 0,
    distinctCountriesAttacked: 0,
    referralCount: 0,
    flagCount: 0,
    earned: {},
    minted: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await collection.insertOne(newProgress)
  return newProgress
}

/**
 * Update earned levels based on current metrics (idempotent)
 */
export async function updateEarnedLevels(userId: string): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  const progress = await getOrCreateProgress(checksummed)
  const newEarned = calculateAllEarnedLevels(progress)

  await collection.updateOne(
    { userId: checksummed },
    {
      $set: {
        earned: newEarned,
        updatedAt: new Date(),
      },
    }
  )
}

/**
 * Increment attack count and update earned levels
 */
export async function incrementAttackCount(userId: string): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  // Increment attack count
  await collection.updateOne(
    { userId: checksummed },
    {
      $inc: { totalAttacks: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        userId: checksummed,
        distinctCountriesAttacked: 0,
        referralCount: 0,
        flagCount: 0,
        earned: {},
        minted: {},
        createdAt: new Date(),
      },
    },
    { upsert: true }
  )

  // Recalculate earned levels
  await updateEarnedLevels(checksummed)
}

/**
 * Add a new attacked country (distinct count)
 */
export async function addAttackedCountry(userId: string, countryId: number): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  // Use a set to track distinct countries
  await collection.updateOne(
    { userId: checksummed },
    {
      $addToSet: { [`attackedCountries`]: countryId } as any,
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        userId: checksummed,
        totalAttacks: 0,
        referralCount: 0,
        flagCount: 0,
        earned: {},
        minted: {},
        createdAt: new Date(),
      },
    },
    { upsert: true }
  )

  // Recalculate distinct count
  const progress = await collection.findOne({ userId: checksummed })
  if (progress) {
    const distinctCount = (progress as any).attackedCountries?.length || 0
    await collection.updateOne(
      { userId: checksummed },
      {
        $set: {
          distinctCountriesAttacked: distinctCount,
          updatedAt: new Date(),
        },
      }
    )
  }

  // Recalculate earned levels
  await updateEarnedLevels(checksummed)
}

/**
 * Update referral count from referrals collection
 */
export async function updateReferralCount(userId: string): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()

  // Count active referrals
  const referralCount = await db.collection('referrals').countDocuments({
    refWallet: checksummed,
    confirmedOnChain: true,
    isActive: true,
  })

  await db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS).updateOne(
    { userId: checksummed },
    {
      $set: {
        referralCount,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        userId: checksummed,
        totalAttacks: 0,
        distinctCountriesAttacked: 0,
        flagCount: 0,
        earned: {},
        minted: {},
        createdAt: new Date(),
      },
    },
    { upsert: true }
  )

  // Recalculate earned levels
  await updateEarnedLevels(checksummed)
}

/**
 * Update flag count (number of total flags owned)
 */
export async function updateFlagCount(userId: string, ownedCount: number): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  await collection.updateOne(
    { userId: checksummed },
    {
      $set: {
        flagCount: ownedCount,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        userId: checksummed,
        totalAttacks: 0,
        distinctCountriesAttacked: 0,
        referralCount: 0,
        earned: {},
        minted: {},
        createdAt: new Date(),
      },
    },
    { upsert: true }
  )

  // Recalculate earned levels
  await updateEarnedLevels(checksummed)
}

/**
 * Mark achievement as minted (after on-chain confirmation)
 */
export async function markAsMinted(userId: string, category: number, level: number): Promise<void> {
  const checksummed = getAddress(userId)
  const db = await getDb()
  const collection = db.collection<AchievementProgress>(ACHV_COLLECTIONS.PROGRESS)

  const progress = await getOrCreateProgress(checksummed)
  const categoryKey = category.toString()
  const currentMinted = progress.minted[categoryKey] || []

  if (!currentMinted.includes(level)) {
    currentMinted.push(level)
    currentMinted.sort((a, b) => a - b)

    await collection.updateOne(
      { userId: checksummed },
      {
        $set: {
          [`minted.${categoryKey}`]: currentMinted,
          updatedAt: new Date(),
        },
      }
    )
  }
}

/**
 * Check if user is eligible to mint a specific achievement
 */
export async function isEligibleToMint(
  userId: string,
  category: number,
  level: number
): Promise<{ eligible: boolean; reason?: string }> {
  const checksummed = getAddress(userId)
  const progress = await getOrCreateProgress(checksummed)

  const categoryKey = category.toString()
  const earned = progress.earned[categoryKey] || []
  const minted = progress.minted[categoryKey] || []

  if (!earned.includes(level)) {
    return { eligible: false, reason: 'NOT_EARNED' }
  }

  if (minted.includes(level)) {
    return { eligible: false, reason: 'ALREADY_MINTED' }
  }

  return { eligible: true }
}

/**
 * Get all achievement definitions
 */
export async function getAllDefinitions(): Promise<AchievementDefinition[]> {
  const db = await getDb()
  return db
    .collection<AchievementDefinition>(ACHV_COLLECTIONS.DEFS)
    .find({ enabled: true })
    .toArray()
}

