// Prewarm worker - keeps hot data cached
import { config } from 'dotenv'
config({ path: '.env.local' })

import { makeWorker } from '../lib/queue'
import { cacheSet } from '../lib/cache'
import { readContract } from 'wagmi/actions'
import { config as wagmiConfig } from '../app/providers'
import { CORE_ABI } from '../lib/core-abi'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const COUNTRY_IDS = [1, 44, 90] // US, UK, Turkey

interface PrewarmData {
  type: 'countries' | 'full'
}

const processor = makeWorker<PrewarmData>('prewarm', async (job) => {
  console.log('[PREWARM] Starting cache warm-up:', job.data.type)

  try {
    // Warm up country data
    for (const id of COUNTRY_IDS) {
      const country = await readContract(wagmiConfig, {
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'countries',
        args: [BigInt(id)]
      })

      await cacheSet(`country:${id}`, country, 5) // 5s TTL
      console.log(`[PREWARM] Cached country ${id}`)

      // Also cache remaining supply
      const supply = await readContract(wagmiConfig, {
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'remainingSupply',
        args: [BigInt(id)]
      })

      await cacheSet(`supply:${id}`, supply, 3) // 3s TTL
      console.log(`[PREWARM] Cached supply ${id}`)
    }

    console.log('[PREWARM] Cache warm-up completed')
  } catch (err) {
    console.error('[PREWARM] Error:', err)
    throw err
  }
})

if (processor) {
  console.log('✅ Prewarm worker started')
} else {
  console.log('⚠️  Prewarm worker not started (USE_QUEUE=false or Redis unavailable)')
  process.exit(0)
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[PREWARM] Shutting down...')
  if (processor) {
    processor.worker.close().then(() => {
      console.log('[PREWARM] Worker closed')
      processor.events.close().then(() => {
        console.log('[PREWARM] Events closed')
        process.exit(0)
      })
    })
  } else {
    process.exit(0)
  }
})

