import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getAddress, createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { getDb } from '@/lib/mongodb'
import { getUserAddressFromJWT } from '@/lib/jwt'
import { rateLimit } from '@/lib/rl'
import { CORE_ADDRESS } from '@/lib/addresses'
import { CORE_ABI } from '@/lib/core-abi'

const QUEST_COMMUNICATION = 'COMMUNICATION_SPECIALIST'
const QUEST_SOCIAL = 'SOCIAL_WARRIOR'
const SOCIAL_STEPS = new Set(['follow', 'tweet'])

// Aktif country ID'leri (en az bir bayrak kontrolü için)
const ACTIVE_COUNTRY_IDS = [1, 44, 90] // US, UK, Turkey

// Public client for on-chain checks
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'),
})

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])

// Kullanıcının en az bir bayrağa sahip olup olmadığını kontrol et
async function hasAtLeastOneFlag(userAddress: `0x${string}`): Promise<boolean> {
  try {
    // Tüm aktif country'ler için token adreslerini al
    const countryCalls = ACTIVE_COUNTRY_IDS.map(id => ({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: 'countries' as const,
      args: [BigInt(id)],
    }))

    const countryResults = await publicClient.multicall({
      contracts: countryCalls,
      allowFailure: true,
    })

    // Token adreslerini çıkar ve balance'ları kontrol et
    const balanceCalls = countryResults
      .map((result, i) => {
        if (result.status === 'success') {
          const tokenAddr = (result.result as any)[1] as `0x${string}`
          return {
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: 'balanceOf' as const,
            args: [userAddress],
          }
        }
        return null
      })
      .filter(Boolean) as any[]

    if (balanceCalls.length === 0) return false

    const balanceResults = await publicClient.multicall({
      contracts: balanceCalls,
      allowFailure: true,
    })

    // En az bir balance > 0 ise true döndür
    return balanceResults.some(
      result => result.status === 'success' && (result.result as bigint) > 0n
    )
  } catch (error) {
    console.error('[Quest] Error checking flag ownership:', error)
    // Hata durumunda false döndür (güvenli taraf)
    return false
  }
}

type ClaimResponse = {
  ok: boolean
  questKey?: string
  claimed?: boolean
  freeGiven?: boolean
  code?: string
  message?: string
  steps?: {
    follow: boolean
    tweet: boolean
    ready: boolean
  }
  progress?: {
    follow: boolean
    tweet: boolean
  }
  awarded?: number
  used?: number
  totalLimit?: number
}

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const sessionWallet = await getUserAddressFromJWT(req).catch(() => null)
    const body = await req.json().catch(() => ({}))

    const bodyWallet = typeof body?.wallet === 'string' ? body.wallet : null
    const pickedWallet = sessionWallet || bodyWallet

    if (!pickedWallet) {
      return NextResponse.json({ ok: false, error: 'MISSING_WALLET' }, { status: 400 })
    }

    let checksumWallet: `0x${string}`
    try {
      checksumWallet = getAddress(pickedWallet)
    } catch {
      return NextResponse.json({ ok: false, error: 'INVALID_WALLET' }, { status: 400 })
    }

    if (
      sessionWallet &&
      sessionWallet.toLowerCase() !== checksumWallet.toLowerCase()
    ) {
      return NextResponse.json({ ok: false, error: 'WALLET_MISMATCH' }, { status: 403 })
    }

    const requestedType =
      typeof body?.type === 'string'
        ? String(body.type).toUpperCase()
        : QUEST_COMMUNICATION
    const questType =
      requestedType === QUEST_SOCIAL || requestedType === QUEST_COMMUNICATION
        ? requestedType
        : QUEST_COMMUNICATION

    const walletLower = checksumWallet.toLowerCase()

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    if (
      !rateLimit(`quest-claim:${ip}`, 40, 60_000) ||
      !rateLimit(`quest-claim:${walletLower}`, 40, 60_000)
    ) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      )
    }

    const db = await getDb()
    const freeAttacks = db.collection('free_attacks')
    const questClaims = db.collection('quest_claims')
    const questProgress = db.collection('quest_progress')
    const maxFree = Number(process.env.MAX_FREE_ATTACKS_PER_USER || '2')
    const now = new Date()

    if (questType === QUEST_COMMUNICATION) {
      return await handleCommunicationSpecialist({
        freeAttacks,
        questClaims,
        walletLower,
        walletChecksum: checksumWallet,
        body,
        now,
        maxFree,
      })
    }

    return await handleSocialWarrior({
      freeAttacks,
      questClaims,
      questProgress,
      walletLower,
      walletChecksum: checksumWallet,
      now,
      maxFree,
      meta:
        typeof body?.meta === 'object' && body?.meta !== null ? body.meta : {},
    })
  } catch (err: any) {
    console.error('[Quest] Claim exception:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'server_error' },
      { status: 200 }
    )
  }
}

async function ensureFreeAttackDocument(options: {
  freeAttacks: any
  walletLower: string
  maxFree: number
  now: Date
}) {
  const { freeAttacks, walletLower, maxFree, now } = options
  await freeAttacks.updateOne(
    { wallet: walletLower },
    {
      // sadece ilk oluştururken bu alanları yaz
      $setOnInsert: {
        wallet: walletLower,
        used: 0,
        awarded: 0,
        createdAt: now,
      },
      // her seferinde updatedAt ve totalLimit'i güncelle (totalLimit her zaman doğru olmalı)
      $set: {
        updatedAt: now,
        totalLimit: maxFree,
      },
    },
    { upsert: true }
  )
}

async function enforceMinimumAward(options: {
  freeAttacks: any
  walletLower: string
  minAwarded: number
  maxFree: number
  now: Date
}) {
  const { freeAttacks, walletLower, minAwarded, maxFree, now } = options
  const target = Math.min(minAwarded, maxFree)
  await freeAttacks.updateOne(
    { wallet: walletLower },
    {
      $set: {
        awarded: target,
        updatedAt: now,
        totalLimit: maxFree,
      },
    }
  )
}

async function tryAwardFreeAttack(options: {
  freeAttacks: any
  walletLower: string
  maxFree: number
  now: Date
}) {
  const { freeAttacks, walletLower, maxFree, now } = options
  const updated = await freeAttacks.findOneAndUpdate(
    {
      wallet: walletLower,
      $expr: {
        $lt: [
          { $ifNull: ['$awarded', 0] },
          {
            $min: [
              { $ifNull: ['$totalLimit', maxFree] },
              maxFree,
            ],
          },
        ],
      },
    },
    {
      $inc: { awarded: 1 },
      $set: { updatedAt: now, totalLimit: maxFree },
    },
    { returnDocument: 'after' }
  )

  if (updated.value) {
    return {
      freeGiven: true,
      doc: updated.value,
    }
  }

  const doc = await freeAttacks.findOne({ wallet: walletLower })
  return {
    freeGiven: false,
    doc,
  }
}

async function upsertQuestClaim(options: {
  questClaims: any
  walletLower: string
  questKey: string
  now: Date
  extras?: Record<string, any>
}) {
  const { questClaims, walletLower, questKey, now, extras } = options
  const insertExtras = extras ? { ...extras } : undefined
  // Sadece insert sırasında set edilmesi gereken field'ları filtrele
  // Bu field'lar update sırasında $set'e eklenmemeli (conflict önlemek için)
  const immutableFields = new Set(['userId', 'questId', 'discordId', 'source', 'meta'])
  const updateExtras = extras
    ? Object.fromEntries(
        Object.entries(extras).filter(([key]) => !immutableFields.has(key))
      )
    : undefined

  await questClaims.updateOne(
    { wallet: walletLower, questKey },
    {
      $setOnInsert: {
        wallet: walletLower,
        questKey,
        questId: questKey,
        claimedAt: now,
        createdAt: now,
        ...(insertExtras ?? {}),
      },
      $set: {
        updatedAt: now,
        ...(updateExtras ?? {}),
      },
    },
    { upsert: true }
  )
}

async function handleCommunicationSpecialist(options: {
  freeAttacks: any
  questClaims: any
  walletLower: string
  walletChecksum: `0x${string}`
  body: any
  now: Date
  maxFree: number
}): Promise<NextResponse<ClaimResponse>> {
  const {
    freeAttacks,
    questClaims,
    walletLower,
    walletChecksum,
    body,
    now,
    maxFree,
  } = options

  const discordId = typeof body?.discordId === 'string' ? body.discordId : null
  if (!discordId) {
    return NextResponse.json(
      { ok: false, error: 'missing_params' },
      { status: 200 }
    )
  }

  const existingClaim = await questClaims.findOne({
    wallet: walletLower,
    questKey: QUEST_COMMUNICATION,
  })

  await ensureFreeAttackDocument({ freeAttacks, walletLower, maxFree, now })

  if (existingClaim) {
    await enforceMinimumAward({
      freeAttacks,
      walletLower,
      minAwarded: 1,
      maxFree,
      now,
    })

    const progressDoc = await freeAttacks.findOne({ wallet: walletLower })

    return NextResponse.json(
      {
        ok: true,
        questKey: QUEST_COMMUNICATION,
        claimed: true,
        code: 'ALREADY_CLAIMED',
        freeGiven: false,
        awarded: progressDoc?.awarded ?? 0,
        used: progressDoc?.used ?? 0,
        totalLimit: progressDoc?.totalLimit ?? maxFree,
      },
      { status: 200 }
    )
  }

  // Önce quest claim'i kaydet
  await upsertQuestClaim({
    questClaims,
    walletLower,
    questKey: QUEST_COMMUNICATION,
    now,
    extras: {
      userId: walletChecksum,
      discordId,
      source: 'discord',
    },
  })
  console.log(`[Quest] ${QUEST_COMMUNICATION} claim saved for ${walletLower}`)

  // Sonra free attack ver
  const beforeAward = await freeAttacks.findOne({ wallet: walletLower })
  console.log(`[Quest] Before award - awarded: ${beforeAward?.awarded ?? 0}, totalLimit: ${beforeAward?.totalLimit ?? 'missing'}, maxFree: ${maxFree}`)
  
  const { freeGiven, doc } = await tryAwardFreeAttack({
    freeAttacks,
    walletLower,
    maxFree,
    now,
  })

  console.log(`[Quest] After award - freeGiven: ${freeGiven}, awarded: ${doc?.awarded ?? 0}, totalLimit: ${doc?.totalLimit ?? 'missing'}`)

  if (!freeGiven) {
    console.warn(`[Quest] ${QUEST_COMMUNICATION} award skipped due to limit for ${walletLower}`)
  } else {
    console.log(`[Quest] ${QUEST_COMMUNICATION} claim ok for ${walletLower}`)
  }

  return NextResponse.json(
    {
      ok: true,
      questKey: QUEST_COMMUNICATION,
      claimed: true,
      freeGiven,
      awarded: doc?.awarded ?? 0,
      used: doc?.used ?? 0,
      totalLimit: doc?.totalLimit ?? maxFree,
    },
    { status: 200 }
  )
}

async function handleSocialWarrior(options: {
  freeAttacks: any
  questClaims: any
  questProgress: any
  walletLower: string
  walletChecksum: `0x${string}`
  now: Date
  maxFree: number
  meta: Record<string, any>
}): Promise<NextResponse<ClaimResponse>> {
  const {
    freeAttacks,
    questClaims,
    questProgress,
    walletLower,
    walletChecksum,
    now,
    maxFree,
    meta,
  } = options

  const methodRaw = typeof meta?.method === 'string' ? meta.method.toLowerCase() : null
  const method = methodRaw && SOCIAL_STEPS.has(methodRaw) ? methodRaw : methodRaw === 'claim' ? 'claim' : null

  const existingClaim = await questClaims.findOne({
    wallet: walletLower,
    questKey: QUEST_SOCIAL,
  })

  const progressDoc = await questProgress.findOne({
    wallet: walletLower,
    questKey: QUEST_SOCIAL,
  })

  const currentSteps = new Set<string>(Array.isArray(progressDoc?.steps) ? progressDoc.steps : [])

  if (method && SOCIAL_STEPS.has(method)) {
    currentSteps.add(method)
    await questProgress.updateOne(
      { wallet: walletLower, questKey: QUEST_SOCIAL },
      {
        $setOnInsert: {
          wallet: walletLower,
          questKey: QUEST_SOCIAL,
          createdAt: now,
        },
        $addToSet: { steps: method },
        $set: { updatedAt: now },
      },
      { upsert: true }
    )
  }

  const hasFollow = currentSteps.has('follow')
  const hasTweet = currentSteps.has('tweet')
  const ready = hasFollow && hasTweet

  if (existingClaim) {
    await ensureFreeAttackDocument({ freeAttacks, walletLower, maxFree, now })
    const doc = await freeAttacks.findOne({ wallet: walletLower })
    return NextResponse.json(
      {
        ok: true,
        questKey: QUEST_SOCIAL,
        claimed: true,
        code: 'ALREADY_CLAIMED',
        freeGiven: false,
        steps: { follow: hasFollow, tweet: hasTweet, ready },
        progress: { follow: hasFollow, tweet: hasTweet },
        awarded: doc?.awarded ?? 0,
        used: doc?.used ?? 0,
        totalLimit: doc?.totalLimit ?? maxFree,
      },
      { status: 200 }
    )
  }

  if (method === 'claim') {
    if (!ready) {
      return NextResponse.json(
        {
          ok: true,
          questKey: QUEST_SOCIAL,
          claimed: false,
          freeGiven: false,
          code: 'MISSING_STEPS',
          message: 'Complete both actions before claiming.',
          steps: { follow: hasFollow, tweet: hasTweet, ready },
          progress: { follow: hasFollow, tweet: hasTweet },
        },
        { status: 200 }
      )
    }

    // Kullanıcının en az bir bayrağa sahip olup olmadığını kontrol et
    const hasFlag = await hasAtLeastOneFlag(walletChecksum)
    if (!hasFlag) {
      return NextResponse.json(
        {
          ok: true,
          questKey: QUEST_SOCIAL,
          claimed: false,
          freeGiven: false,
          code: 'NO_FLAGS',
          message: 'You must own at least one flag to claim this quest.',
          steps: { follow: hasFollow, tweet: hasTweet, ready },
          progress: { follow: hasFollow, tweet: hasTweet },
        },
        { status: 200 }
      )
    }

    await ensureFreeAttackDocument({ freeAttacks, walletLower, maxFree, now })

    await upsertQuestClaim({
      questClaims,
      walletLower,
      questKey: QUEST_SOCIAL,
      now,
      extras: {
        userId: walletChecksum,
        source: 'social',
        meta: { follow: hasFollow, tweet: hasTweet },
      },
    })

    const { freeGiven, doc } = await tryAwardFreeAttack({
      freeAttacks,
      walletLower,
      maxFree,
      now,
    })

    if (!freeGiven) {
      console.warn(`[Quest] ${QUEST_SOCIAL} award skipped due to limit for ${walletLower}`)
    } else {
      console.log(`[Quest] ${QUEST_SOCIAL} claim ok for ${walletLower}`)
    }

    await questProgress.updateOne(
      { wallet: walletLower, questKey: QUEST_SOCIAL },
      { $set: { completedAt: now, updatedAt: now } }
    )

    return NextResponse.json(
      {
        ok: true,
        questKey: QUEST_SOCIAL,
        claimed: true,
        freeGiven,
        steps: { follow: hasFollow, tweet: hasTweet, ready },
        progress: { follow: hasFollow, tweet: hasTweet },
        awarded: doc?.awarded ?? 0,
        used: doc?.used ?? 0,
        totalLimit: doc?.totalLimit ?? maxFree,
      },
      { status: 200 }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      questKey: QUEST_SOCIAL,
      claimed: false,
      freeGiven: false,
      steps: { follow: hasFollow, tweet: hasTweet, ready },
      progress: { follow: hasFollow, tweet: hasTweet },
    },
    { status: 200 }
  )
}
