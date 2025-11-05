import { MongoClient } from 'mongodb'
import 'dotenv/config'

const COLLECTIONS = {
  USERS: 'users',
}

async function initUsersIndexes() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is not defined in .env.local')
    process.exit(1)
  }

  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db('flagwars')

    console.log(`Ensuring indexes for collection: ${COLLECTIONS.USERS}`)

    const collection = db.collection(COLLECTIONS.USERS)

    // Clean up invalid documents (userId is null or missing)
    const deleteResult = await collection.deleteMany({ userId: null })
    console.log(`Deleted ${deleteResult.deletedCount} invalid documents`)

    // Drop existing indexes to ensure clean state for unique index
    try {
      await collection.dropIndexes()
      console.log(`Dropped existing indexes for ${COLLECTIONS.USERS}`)
    } catch (e: any) {
      if (e.codeName === 'IndexNotFound') {
        console.log('No existing indexes to drop.')
      } else {
        console.warn('Error dropping indexes (might not exist):', e)
      }
    }

    // Create unique index on userId
    await collection.createIndex(
      { userId: 1 },
      { unique: true, name: 'userId_unique' }
    )
    console.log(`Created unique index on { userId: 1 } for ${COLLECTIONS.USERS}`)

    // Create index for lastLoginAt for time-based queries
    await collection.createIndex(
      { lastLoginAt: -1 },
      { name: 'lastLoginAt_desc' }
    )
    console.log(`Created index on { lastLoginAt: -1 } for ${COLLECTIONS.USERS}`)

    console.log('Users indexes ensured successfully.')
  } catch (error) {
    console.error('Error ensuring users indexes:', error)
  } finally {
    await client.close()
  }
}

initUsersIndexes()

