// lib/users.ts
// NEVER: Case-sensitive wallet addresses, duplicate user creation
// ALWAYS: Lowercase wallet addresses, upsert operations, unique referral codes
import { getDb } from './mongodb'

export interface User {
  _id?: any
  wallet: string
  createdAt: Date
  referralCode?: string
}

export async function findUserByWallet(wallet: string) {
  const db = await getDb()
  return db.collection<User>('users').findOne({ wallet: wallet.toLowerCase() })
}

function generateReferralCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export async function findOrCreateUser(wallet: string): Promise<User> {
  const w = wallet.toLowerCase()
  const db = await getDb()
  const now = new Date()
  const ref = generateReferralCode()

  await db.collection('users').updateOne(
    { wallet: w },
    { $setOnInsert: { wallet: w, createdAt: now, referralCode: ref } },
    { upsert: true }
  )

  return (await findUserByWallet(w))!
}