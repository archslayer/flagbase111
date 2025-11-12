import { USE_REDIS } from '../cfg'
import { enqueueMemory } from './memory'
import { enqueueRedis } from './redis'

export type AttackJob = {
  user: `0x${string}`
  fromId: number
  toId: number
  idempotencyKey: string
  // amountToken18 removed - attacks are now fixed single attacks
}

export async function enqueueAttackJob (job: AttackJob) {
  return USE_REDIS ? enqueueRedis(job) : enqueueMemory(job)
}


