// lib/mongodb.ts
// NEVER: Import-time side effects, swallow errors, log secrets
// ALWAYS: Singleton client, TLS, ping verification, redact secrets
import { MongoClient } from 'mongodb'

let client: MongoClient | null = null
let connecting: Promise<MongoClient> | null = null

const redactUri = (uri: string) =>
  uri.replace(/(mongodb\+srv?:\/\/)[^:]+:[^@]+@/i, '$1***:***@')

/**
 * Get the MongoDB client instance (for closing connection)
 */
export function getClient() {
  return client
}

export async function getDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  if (client) return client.db()

  if (!connecting) {
    // Only enable TLS for mongodb+srv:// URIs
    const isSrv = uri.startsWith('mongodb+srv://')
    const tlsOpts = isSrv 
      ? { tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false }
      : {}
    
    const options = {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 15_000,
      maxPoolSize: 20, // Increased for worker concurrency
      minPoolSize: 2,
      maxIdleTimeMS: 60_000,
      retryReads: true,
      retryWrites: true,
      ...tlsOpts,
    } as any

    console.log('🔌 Connecting MongoDB:', redactUri(uri))
    connecting = (async () => {
      const c = new MongoClient(uri, options)
      await c.connect()
      try {
        await c.db().command({ ping: 1 })
        console.log('✅ MongoDB ping OK')
      } catch (e) {
        console.error('❌ MongoDB ping failed:', e)
        await c.close()
        throw e
      }
      client = c
      return c
    })()
  }

  const c = await connecting
  return c.db()
}

export async function ensureIndexes() {
  const db = await getDb()
  
  // tx_events: append-only raw records (idempotent)
  await db.collection('tx_events').createIndex(
    { txHash: 1, logIndex: 1, type: 1 },
    { unique: true, name: 'uniq_tx_log_type' }
  )
  
  // wallet_stats_daily: wallet + day aggregates
  await db.collection('wallet_stats_daily').createIndex(
    { wallet: 1, day: 1, chainId: 1 },
    { unique: true, name: 'uniq_wallet_day_chain' }
  )
  
  // country_stats_daily: country + day aggregates
  await db.collection('country_stats_daily').createIndex(
    { countryId: 1, day: 1, chainId: 1 },
    { unique: true, name: 'uniq_country_day_chain' }
  )
  
  console.log('✅ Analytics indexes ensured')
}