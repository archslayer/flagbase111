import 'server-only'

export const COLLECTIONS = {
  USER_BALANCES: 'user_balances'
} as const

export interface UserBalance {
  _id?: unknown
  userId: string // checksummed wallet address
  countryId: number // 1, 44, 90 ...
  amountToken18: string // "3000000000000000000" - raw BigInt string
  amount: number // whole tokens (for display)
  updatedAt: Date
}

