const { config } = require('dotenv')
config({ path: '.env.local' })
const { MongoClient } = require('mongodb')

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('Missing MONGODB_URI')
  }

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()

  const walletLower = '0xc32e33f743cf7f95d90d1392771632ff1640de16'
  const userId = '0xc32e33F743Cf7f95D90D1392771632fF1640DE16'
  const now = new Date()

  await db.collection('quest_claims').deleteMany({ wallet: walletLower })
  await db.collection('quest_progress').deleteMany({ wallet: walletLower })
  await db.collection('free_attacks').deleteMany({ wallet: walletLower })
  await db.collection('processed_tx').deleteMany({ wallet: walletLower })
  await db.collection('attacks').deleteMany({ user: userId })

  const update = {
    $set: { freeAttacksClaimed: 0, updatedAt: now },
    $setOnInsert: {
      userId,
      totalAttacks: 0,
      distinctCountriesAttacked: 0,
      referralCount: 0,
      flagCount: 0,
      earned: {},
      minted: {},
      createdAt: now
    }
  }

  await db.collection('achv_progress').updateOne({ userId }, update, { upsert: true })

  await client.close()
  console.log('Reset done')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

