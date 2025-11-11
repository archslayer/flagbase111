// @server-only - This module uses Redis and should NEVER be imported by client components
// Rule: Always enforce minOut and deadline on writes; never send without protection.
// Add timeout for robustness and avoid hanging requests.

import { createWalletClient, http, parseAbi, type Account } from 'viem'
import { baseSepolia } from 'viem/chains'
import { TX_TIMEOUT_MS } from './cfg'

const CORE = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const RPC = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA as string

export const CORE_ABI = parseAbi([
  'function buy(uint256,uint256,uint256,uint256)',
  'function sell(uint256,uint256,uint256,uint256)',
  'function attack(uint256,uint256,uint256) payable',
])

export function makeWallet (account: Account) {
  return createWalletClient({ chain: baseSepolia, transport: http(RPC), account })
}

export async function writeWithTimeout<T> (p: Promise<T>, ms = TX_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('TX_TIMEOUT')), ms))
  ])
}

export { CORE, RPC }

// Transaction status management for SSE with Redis PubSub adapter
import { EventEmitter } from 'events'

type TxStatus = 'PENDING'|'CONFIRMED'|'FAILED'

// TTL yönetimi
const STATUS_TTL_MS = 10 * 60 * 1000 // 10 dk
const memStatus = new Map<string, { status: TxStatus; expiresAt: number }>()
const memOwner = new Map<string, `0x${string}`>() // txId -> owner
const memEmitters = new Map<string, EventEmitter>()

function now(){ return Date.now() }
function reap() {
  const t = now()
  for (const [k, v] of memStatus) if (v.expiresAt <= t) memStatus.delete(k)
}
// 60 sn'de bir temizlik
setInterval(reap, 60_000).unref?.()

function getMemEmitter(id: string) {
  let em = memEmitters.get(id)
  if (!em) { em = new EventEmitter(); memEmitters.set(id, em) }
  return em
}

export function setTxOwner(id: string, owner: `0x${string}`) {
  memOwner.set(id, owner)
}

export function getTxOwner(id: string): `0x${string}` | undefined {
  return memOwner.get(id)
}

export async function setTxStatus(id: string, status: TxStatus) {
  memStatus.set(id, { status, expiresAt: now() + STATUS_TTL_MS })
  getMemEmitter(id).emit('status', status)

  try {
    const { getRedisPub } = require('./redis')
    const pub = await getRedisPub()
    if (pub) await pub.publish(`tx:${id}`, JSON.stringify({ id, status }))
  } catch (error) {
    // Telemetri: Redis publish error
    try {
      const { incrementRedisError } = require('./telemetry')
      incrementRedisError('publish')
    } catch {}
  }
}

export function getTxStatus(id: string): TxStatus {
  return memStatus.get(id)?.status ?? 'PENDING'
}

export async function emitPriceForTx(id: string, payload: any) {
  getMemEmitter(id).emit('price', payload)
  try {
    const { getRedisPub } = require('./redis')
    const pub = await getRedisPub()
    if (pub) await pub.publish(`tx:${id}`, JSON.stringify({ id, event:'price', ...payload }))
  } catch (error) {
    // Telemetri: Redis publish error
    try {
      const { incrementRedisError } = require('./telemetry')
      incrementRedisError('publish')
    } catch {}
  }
}

export function getTxEmitter(id: string): EventEmitter {
  return getMemEmitter(id)
}



