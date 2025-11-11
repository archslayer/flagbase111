import { ObjectId } from 'mongodb'

export const COLLECTIONS = {
  USERS: 'users',
}

export interface User {
  _id?: ObjectId
  userId: string // checksummed wallet (unique)
  createdAt: Date
  lastLoginAt: Date
  // future-safe fields:
  username?: string
  avatarUrl?: string
  referralBound?: boolean
  flags?: string[]
}

