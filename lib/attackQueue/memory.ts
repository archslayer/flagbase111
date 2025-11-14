import type { AttackJob } from './types'

const byCountry: Record<number, AttackJob[]> = {}
let working = new Set<number>()

export async function enqueueMemory (job: AttackJob) {
  const q = (byCountry[job.fromId] ||= [])
  q.push(job)
  void tick(job.fromId)
}

async function tick (countryId: number) {
  if (working.has(countryId)) return
  const q = byCountry[countryId] || []
  if (q.length === 0) return
  working.add(countryId)

  try {
    while (q.length) {
      const j = q.shift()!
      try {
        const { executeAttackJob } = await import('../../workers/txWorker')
        await executeAttackJob(j)
      } catch (err) {
        // swallow here, worker handles idempotency end; add retry policy later
      }
    }
  } finally {
    working.delete(countryId)
    if ((byCountry[countryId] || []).length) void tick(countryId)
  }
}


