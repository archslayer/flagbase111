import { getDb } from '@/lib/mongodb'
import { getAddress } from 'viem'

const DEFAULT_LIMIT = Number(process.env.MAX_FREE_ATTACKS_PER_USER || '2')

interface FreeAttackDoc {
  wallet: string
  used: number
  consumedTxs?: string[]
  awarded?: number
  totalLimit?: number
  createdAt: Date
  updatedAt: Date
}

type ProcessAttackEventInput = {
  wallet: string
  txHash: string
  feeUSDC6?: number | string
  timestamp?: number
}

type ProcessAttackEventResult = {
  ok: true
  alreadyProcessed?: boolean
  consumed: boolean
  awarded?: number
  used?: number
  totalLimit?: number
  remaining?: number
  reason?: string
}

export async function processAttackEvent(input: ProcessAttackEventInput): Promise<ProcessAttackEventResult> {
  const db = await getDb()
  const freeAttacks = db.collection('free_attacks')
  const processed = db.collection('processed_tx')

  const wallet = getAddress(input.wallet).toLowerCase()
  const txHash = input.txHash.toLowerCase()
  const fee = Number(input.feeUSDC6 ?? 0)
  const now = new Date(input.timestamp ?? Date.now())

  const existing = await processed.findOne<{ consumed?: boolean }>({ txHash })
  if (existing) {
    return { ok: true, alreadyProcessed: true, consumed: !!existing.consumed }
  }

  if (fee > 0) {
    await processed.insertOne({
      txHash,
      wallet,
      fee,
      consumed: false,
      createdAt: now,
      updatedAt: now
    })
    return { ok: true, consumed: false }
  }

  const filter = {
    wallet,
    $expr: {
      $lt: [
        '$used',
        {
          $min: [
            { $ifNull: ['$awarded', 0] },
            { $ifNull: ['$totalLimit', DEFAULT_LIMIT] }
          ]
        }
      ]
    }
  }

  // strict Mongo tipleriyle uğraşmamak için update'i any tut
  const update: any = {
    $inc: { used: 1 },
    $set: { updatedAt: now },
    $push: { consumedTxs: txHash }
  }

  const updated = await freeAttacks.findOneAndUpdate(filter, update, { returnDocument: 'after' })

  if (!updated || !('value' in updated) || !updated.value) {
    const doc = await freeAttacks.findOne<FreeAttackDoc & { awarded?: number; totalLimit?: number }>({ wallet })
    if (!doc) {
      await freeAttacks.insertOne({
        wallet,
        awarded: 0,
        used: 0,
        totalLimit: DEFAULT_LIMIT,
        createdAt: now,
        updatedAt: now
      })
    }

    await processed.insertOne({
      txHash,
      wallet,
      fee,
      consumed: false,
      createdAt: now,
      updatedAt: now
    })

    return { ok: true, consumed: false, reason: 'no-free-left' }
  }

  const awarded = updated.value.awarded ?? 0
  const used = updated.value.used ?? 0
  const totalLimit = updated.value.totalLimit ?? DEFAULT_LIMIT
  const remaining = Math.max(0, Math.min(awarded, totalLimit) - used)

  await processed.insertOne({
    txHash,
    wallet,
    fee,
    consumed: true,
    createdAt: now,
    updatedAt: now
  })

  return {
    ok: true,
    consumed: true,
    awarded,
    used,
    totalLimit,
    remaining
  }
}

