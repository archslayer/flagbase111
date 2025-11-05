import 'server-only'

/**
 * Flags Snapshots Schema
 * Tracks user flag count at specific points in time for achievement threshold detection
 */

export interface FlagSnapshot {
  _id?: any
  userId: string          // checksummed wallet address
  ownedCount: number     // total number of flags owned at this moment
  ts: Date               // timestamp of snapshot
}

