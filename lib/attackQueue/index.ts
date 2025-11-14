import { USE_REDIS } from '../cfg'
import { enqueueMemory } from './memory'
import { enqueueRedis } from './redis'
import type { AttackJob } from './types'

export type { AttackJob } from './types'

export async function enqueueAttackJob (job: AttackJob) {
  return USE_REDIS ? enqueueRedis(job) : enqueueMemory(job)
}


