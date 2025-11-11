import type { AttackJob } from './index'

export async function enqueueRedis (_job: AttackJob) {
  throw new Error('USE_REDIS=true olduğunda BullMQ entegrasyonunu aktifleştirin.')
}


