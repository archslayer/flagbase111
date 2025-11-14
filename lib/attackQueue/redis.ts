import type { AttackJob } from './types'

export async function enqueueRedis (_job: AttackJob) {
  throw new Error('USE_REDIS=true olduğunda BullMQ entegrasyonunu aktifleştirin.')
}


