/**
 * Referral System - Core Logic
 * Handles code generation, resolution, and cookie management
 * @server-only - This module uses Node.js crypto and should only run on server
 */

import 'server-only'
import { createHmac, createHash } from 'crypto'
import { getAddress } from 'viem'
import { getDb } from './mongodb'
import { COLLECTIONS, type RefCode, type RefCookiePayload } from './schemas/referral'

const APP_SECRET = process.env.REFERRAL_SECRET || 'dev-secret-change-in-production'
const CODE_LENGTH = 10
const COOKIE_NAME = 'fw_ref'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

/**
 * Generate deterministic referral code from wallet
 * Uses HMAC for security + base32 encoding for URL-friendliness
 */
export function generateReferralCode(wallet: string): string {
  const checksummed = getAddress(wallet) // Ensure checksum
  const hmac = createHmac('sha256', APP_SECRET)
  hmac.update(checksummed.toLowerCase())
  const hash = hmac.digest('base64')
  
  // Convert to base32-like (A-Z, 2-7) for case-insensitivity
  const base32 = hash
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .replace(/[018]/g, '2') // Avoid confusing chars
    .replace(/[O]/g, '4')
    .substring(0, CODE_LENGTH)
  
  return base32
}

/**
 * Generate invite URL
 */
export function generateInviteUrl(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}?ref=${code}`
}

/**
 * Resolve referral code to wallet address
 * Checks DB first, then tries deterministic generation
 */
export async function resolveReferralCode(code: string): Promise<{ wallet: string; userId: string } | null> {
  if (!code || code.length < 8 || code.length > 12) {
    return null
  }
  
  // Sanitize input
  const sanitized = code.toUpperCase().replace(/[^A-Z2-7]/g, '')
  if (sanitized !== code.toUpperCase()) {
    return null
  }
  
  const db = await getDb()
  const refCode = await db.collection<RefCode>(COLLECTIONS.REF_CODES).findOne({ 
    code: sanitized 
  })
  
  if (refCode) {
    // Update last used timestamp
    await db.collection<RefCode>(COLLECTIONS.REF_CODES).updateOne(
      { code: sanitized },
      { 
        $set: { lastUsedAt: new Date() },
        $inc: { totalUses: 1 }
      }
    )
    
    return {
      wallet: refCode.wallet,
      userId: refCode.userId
    }
  }
  
  return null
}

/**
 * Create or get referral code for user
 */
export async function getOrCreateRefCode(wallet: string): Promise<string> {
  const checksummed = getAddress(wallet)
  const db = await getDb()
  
  // Check if code already exists
  const existing = await db.collection<RefCode>(COLLECTIONS.REF_CODES).findOne({
    userId: checksummed
  })
  
  if (existing) {
    return existing.code
  }
  
  // Generate new code
  const code = generateReferralCode(checksummed)
  
  // Insert (idempotent - unique index on userId)
  try {
    await db.collection<RefCode>(COLLECTIONS.REF_CODES).insertOne({
      userId: checksummed,
      wallet: checksummed,
      code,
      createdAt: new Date(),
      totalUses: 0
    })
  } catch (error: any) {
    // Duplicate key error is fine (race condition)
    if (error.code !== 11000) {
      throw error
    }
  }
  
  return code
}

// hashIpUserAgent moved to lib/ip-utils.ts for better organization

/**
 * Encode cookie payload
 */
export function encodeRefCookie(payload: Omit<RefCookiePayload, 'exp'>): string {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000
  const fullPayload: RefCookiePayload = { ...payload, exp }
  
  // Encrypt + sign
  const json = JSON.stringify(fullPayload)
  const hmac = createHmac('sha256', APP_SECRET)
  hmac.update(json)
  const signature = hmac.digest('hex')
  
  const encoded = Buffer.from(json).toString('base64url')
  return `${encoded}.${signature}`
}

/**
 * Decode and verify cookie payload
 */
export function decodeRefCookie(cookie: string): RefCookiePayload | null {
  try {
    const [encoded, signature] = cookie.split('.')
    if (!encoded || !signature) return null
    
    const json = Buffer.from(encoded, 'base64url').toString('utf-8')
    
    // Verify signature
    const hmac = createHmac('sha256', APP_SECRET)
    hmac.update(json)
    const expectedSignature = hmac.digest('hex')
    
    if (signature !== expectedSignature) {
      return null
    }
    
    const payload = JSON.parse(json) as RefCookiePayload
    
    // Check expiry
    if (Date.now() > payload.exp) {
      return null
    }
    
    return payload
  } catch {
    return null
  }
}

/**
 * Validate self-referral
 */
export function isSelfReferral(wallet: string, refWallet: string): boolean {
  try {
    const w1 = getAddress(wallet)
    const w2 = getAddress(refWallet)
    return w1 === w2
  } catch {
    return true // If invalid addresses, treat as self-ref (reject)
  }
}

/**
 * Get cookie configuration for Next.js
 */
export function getRefCookieConfig() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  }
}

export { COOKIE_NAME }

