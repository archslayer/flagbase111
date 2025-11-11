// BullMQ Queue and Worker helpers (server-only)
import 'server-only'
import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq'
import { getIORedisConfig } from './redis-ioredis'

const prefix = process.env.QUEUE_PREFIX || 'flagwars'

function getConnection() {
  if (process.env.USE_QUEUE !== 'true') {
    return null
  }
  
  const conn = getIORedisConfig()
  if (!conn) {
    console.warn('[QUEUE] IORedis connection failed')
    return null
  }
  
  return { connection: conn }
}

export function makeQueue(name: string) {
  if (process.env.USE_QUEUE !== 'true') return null
  
  const conn = getConnection()
  if (!conn) return null
  
  try {
    // Remove prefix from name as we're adding it in the Queue constructor
    const queueName = name.includes(':') ? name.split(':').pop()! : name
    return new Queue(`${prefix}-${queueName}`, conn)
  } catch (err) {
    console.error(`[QUEUE] Failed to create queue ${name}:`, err)
    return null
  }
}

export function makeWorker<T = any>(
  name: string,
  processor: (job: { data: T; id?: string }) => Promise<void>
) {
  if (process.env.USE_QUEUE !== 'true') return null
  
  const conn = getConnection()
  if (!conn) return null
  
  const concurrency = Number(process.env.QUEUE_CONCURRENCY || 20)
  
  try {
    // Remove prefix from name as we're adding it in the Worker constructor
    const queueName = name.includes(':') ? name.split(':').pop()! : name
    
    const worker = new Worker(
      `${prefix}-${queueName}`,
      async (job) => {
        await processor({ data: job.data, id: job.id })
      },
      { ...conn, concurrency }
    )
    
    const events = new QueueEvents(`${prefix}-${queueName}`, conn)
    
    worker.on('failed', (job, err) => {
      console.error(`[Q:${queueName}] Job ${job?.id} failed:`, err?.message)
    })
    
    worker.on('completed', (job) => {
      console.log(`[Q:${queueName}] Job ${job?.id} completed`)
    })
    
    worker.on('error', (err) => {
      console.error(`[Q:${queueName}] Worker error:`, err.message)
    })
    
    events.on('error', (err) => {
      console.error(`[Q:${queueName}] Events error:`, err.message)
    })
    
    return { worker, events }
  } catch (err) {
    console.error(`[QUEUE] Failed to create worker ${name}:`, err)
    return null
  }
}

export type QueueJobOpts = JobsOptions

/**
 * Default job options with consistent retry & backoff
 */
export function defaultJobOpts(overrides: QueueJobOpts = {}): QueueJobOpts {
  return {
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    ...overrides
  }
}

