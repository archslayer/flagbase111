/**
 * Transaction guard utilities
 * - Per-wallet single-flight lock
 * - Parameter-based idempotency lock
 * Uses Redis for shared state, falls back to in-memory per-instance.
 */

import { randomUUID } from 'crypto'
import { getAddress } from 'viem'
import { getRedis } from './redis'

type TxMode = 'buy' | 'sell'

export interface TxGuardArgs {
  wallet: string
  mode: TxMode
  countryId: number
  amountWei: bigint
}

export interface TxGuardResult {
  ok: boolean
  reason?: 'IN_FLIGHT' | 'DUPLICATE' | 'INVALID'
  lockKey?: string
}

// Key prefixes and TTLs
const IDEMPOTENCY_PREFIX = 'tx:idempotency:'
const WALLET_LOCK_PREFIX = 'tx:inflight:'
const PARAM_LOCK_PREFIX = 'tx:param:'
const LOCK_PENDING_TTL_SEC = 60
const LOCK_SENT_TTL_SEC = 15

// In-memory fallback maps (per-instance)
const memoryWalletLocks = new Map<string, { token: string; expiresAt: number }>()
const memoryParamLocks = new Map<string, { token: string; expiresAt: number }>()
const memoryLockTokens = new Map<string, { walletKey: string; paramKey: string; token: string; sent: boolean }>()

export function generateTxIdempotencyKey(
  wallet: string,
  action: TxMode,
  countryId: number,
  amountWei: bigint
): string {
  const normalizedWallet = getAddress(wallet).toLowerCase()
  return `${IDEMPOTENCY_PREFIX}${action}:${normalizedWallet}:${countryId}:${amountWei.toString()}`
}

function buildWalletKey(walletLower: string) {
  return `${WALLET_LOCK_PREFIX}${walletLower}`
}

function buildParamKey(walletLower: string, mode: TxMode, countryId: number, amountWei: bigint) {
  return `${PARAM_LOCK_PREFIX}${mode}:${walletLower}:${countryId}:${amountWei.toString()}`
}

function parseLockKey(lockKey: string) {
  const parts = lockKey.split('|')
  if (parts.length !== 3) throw new Error('INVALID_LOCK_KEY')
  const [walletKey, paramKey, token] = parts
  if (!walletKey || !paramKey || !token) throw new Error('INVALID_LOCK_KEY')
  return { walletKey, paramKey, token }
}

function cleanupMemoryLocks() {
  const now = Date.now()
  for (const [key, value] of memoryWalletLocks.entries()) {
    if (value.expiresAt <= now) memoryWalletLocks.delete(key)
  }
  for (const [key, value] of memoryParamLocks.entries()) {
    if (value.expiresAt <= now) memoryParamLocks.delete(key)
  }
  for (const [token, entry] of memoryLockTokens.entries()) {
    const walletLock = memoryWalletLocks.get(entry.walletKey)
    const paramLock = memoryParamLocks.get(entry.paramKey)
    if (!walletLock && !paramLock) memoryLockTokens.delete(token)
  }
}

export async function acquireTxGuards(args: TxGuardArgs): Promise<TxGuardResult> {
  let normalizedWallet: string
  try {
    normalizedWallet = getAddress(args.wallet).toLowerCase()
  } catch {
    return { ok: false, reason: 'INVALID' }
  }

  const walletKey = buildWalletKey(normalizedWallet)
  const paramKey = buildParamKey(normalizedWallet, args.mode, args.countryId, args.amountWei)
  const token = randomUUID()

  const redis = await getRedis()
  if (redis) {
    // Non-atomic two-step acquire with rollback
    try {
      const walletSet = await redis.set(walletKey, token, { NX: true, EX: LOCK_PENDING_TTL_SEC })
      if (walletSet !== 'OK') {
        return { ok: false, reason: 'IN_FLIGHT' }
      }

      const paramSet = await redis.set(paramKey, token, { NX: true, EX: LOCK_PENDING_TTL_SEC })
      if (paramSet !== 'OK') {
        await redis.del(walletKey)
        return { ok: false, reason: 'DUPLICATE' }
      }

      return { ok: true, lockKey: `${walletKey}|${paramKey}|${token}` }
    } catch (error) {
      console.warn('[TxGuards] Redis error during acquire, falling back to memory:', error)
      // fall through to memory
    }
  }

  // Memory fallback
  cleanupMemoryLocks()

  const now = Date.now()
  const walletEntry = memoryWalletLocks.get(walletKey)
  if (walletEntry && walletEntry.expiresAt > now) {
    return { ok: false, reason: 'IN_FLIGHT' }
  }

  const paramEntry = memoryParamLocks.get(paramKey)
  if (paramEntry && paramEntry.expiresAt > now) {
    return { ok: false, reason: 'DUPLICATE' }
  }

  const expiresAt = now + LOCK_PENDING_TTL_SEC * 1000
  memoryWalletLocks.set(walletKey, { token, expiresAt })
  memoryParamLocks.set(paramKey, { token, expiresAt })
  memoryLockTokens.set(token, { walletKey, paramKey, token, sent: false })

  return { ok: true, lockKey: `${walletKey}|${paramKey}|${token}` }
}

export async function releaseTxGuards(lockKey: string): Promise<void> {
  let parsed
  try {
    parsed = parseLockKey(lockKey)
  } catch {
    return
  }

  const { walletKey, paramKey, token } = parsed
  const redis = await getRedis()
  if (redis) {
    try {
      const [walletVal, paramVal] = await redis.mGet([walletKey, paramKey])
      const multi = redis.multi()
      if (walletVal === token) multi.del(walletKey)
      if (paramVal === token) multi.del(paramKey)
      await multi.exec()
      return
    } catch (error) {
      console.warn('[TxGuards] Redis error during release, falling back to memory:', error)
    }
  }

  // Memory fallback
  cleanupMemoryLocks()

  const walletEntry = memoryWalletLocks.get(walletKey)
  if (walletEntry && walletEntry.token === token) memoryWalletLocks.delete(walletKey)

  const paramEntry = memoryParamLocks.get(paramKey)
  if (paramEntry && paramEntry.token === token) memoryParamLocks.delete(paramKey)

  if (memoryLockTokens.has(token)) memoryLockTokens.delete(token)
}

export async function markTxGuardsSent(lockKey: string): Promise<void> {
  let parsed
  try {
    parsed = parseLockKey(lockKey)
  } catch {
    return
  }

  const { walletKey, paramKey, token } = parsed
  const redis = await getRedis()
  if (redis) {
    try {
      const [walletVal, paramVal] = await redis.mGet([walletKey, paramKey])
      const multi = redis.multi()
      if (walletVal === token) multi.expire(walletKey, LOCK_SENT_TTL_SEC)
      if (paramVal === token) multi.expire(paramKey, LOCK_SENT_TTL_SEC)
      await multi.exec()
      return
    } catch (error) {
      console.warn('[TxGuards] Redis error during TTL update, falling back to memory:', error)
    }
  }

  // Memory fallback
  cleanupMemoryLocks()

  const now = Date.now()
  const walletEntry = memoryWalletLocks.get(walletKey)
  if (walletEntry && walletEntry.token === token) walletEntry.expiresAt = now + LOCK_SENT_TTL_SEC * 1000

  const paramEntry = memoryParamLocks.get(paramKey)
  if (paramEntry && paramEntry.token === token) paramEntry.expiresAt = now + LOCK_SENT_TTL_SEC * 1000

  const tokenEntry = memoryLockTokens.get(token)
  if (tokenEntry) tokenEntry.sent = true
}





