import { USE_REDIS } from '../cfg'
import { enqueueMemory } from './memory'
import { enqueueRedis } from './redis'

export type AttackJob = {
  user: `0x${string}`
  fromId: number
  toId: number
  amountToken18: bigint
  idempotencyKey: string
}

export async function enqueueAttackJob (job: AttackJob) {
  return USE_REDIS ? enqueueRedis(job) : enqueueMemory(job)
}


