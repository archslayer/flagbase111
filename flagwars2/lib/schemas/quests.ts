// lib/schemas/quests.ts
import 'server-only'

// ════════════════════════════════════════════════════════════════════════════════
// QUEST SYSTEM SCHEMAS
// ════════════════════════════════════════════════════════════════════════════════

export interface QuestDefinition {
  _id?: any
  key: string              // "COMMUNICATION_SPECIALIST"
  title: string            // "Communication Specialist"
  description: string      // "Join Discord and claim Flag Folks role"
  type: 'discord' | 'onchain' | 'social'
  reward: {
    type: 'free_attack' | 'token' | 'badge'
    amount: number
  }
  requirements: {
    minFlags?: number      // Minimum flags needed
    discordRoleId?: string // Discord role required
    discordGuildId?: string
  }
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

// ════════════════════════════════════════════════════════════════════════════════
// QUEST CLAIMS
// ════════════════════════════════════════════════════════════════════════════════

export interface QuestClaim {
  _id?: any
  userId: string           // checksummed wallet address
  discordId?: string       // Discord user ID (if applicable)
  questKey: string
  claimedAt: Date
  source: 'discord' | 'onchain' | 'manual'
  txHash?: string          // If reward involved on-chain transaction
  rewardGranted: boolean   // Whether reward was successfully granted
}

// ════════════════════════════════════════════════════════════════════════════════
// INITIAL QUEST DEFINITIONS (Seed Data)
// ════════════════════════════════════════════════════════════════════════════════

export const INITIAL_QUEST_DEFS: Omit<QuestDefinition, '_id' | 'createdAt' | 'updatedAt'>[] = [
  {
    key: 'COMMUNICATION_SPECIALIST',
    title: 'Communication Specialist',
    description: 'Join Discord, hold a Flag, get the Flag Folks role.',
    type: 'discord',
    reward: {
      type: 'free_attack',
      amount: 1,
    },
    requirements: {
      minFlags: 1,
      discordRoleId: process.env.FLAG_OWNER_ROLE_ID || '1434567222189359114',
      discordGuildId: process.env.DISCORD_GUILD_ID,
    },
    enabled: true,
  },
]
