"use client"
import { useEffect, useState, Suspense, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { ConnectAndLogin } from '@/components/ConnectAndLogin'
import { useOwnedFlags } from '@/lib/useOwnedFlags'
import { useToast } from '@/components/Toast'
import { estimateAttackFee } from '@/lib/attack-flow'
import { guardedWrite, guardedWaitSafe, guardedRead } from '@/lib/guarded-tx'
import { requireBaseSepolia } from '@/lib/chain-guard'
import { CORE_ABI } from '@/lib/core-abi'
import { formatEther, erc20Abi, parseEther } from 'viem'
import { VictorySplash } from '@/components/VictorySplash'

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

// Active countries in contract
const ALL_FLAGS = [
  { id: 90, name: "Turkey", flagImage: "/flags/TR.png", code: "TR" },
  { id: 44, name: "United Kingdom", flagImage: "/flags/UK.png", code: "GB" },
  { id: 1, name: "United States", flagImage: "/flags/USA.png", code: "US" },
]
const QUEST_SOCIAL_KEY = 'SOCIAL_WARRIOR'

interface Flag {
  id: number
  name: string
  flagImage: string
  code: string
}

type FreeAttackStatsState = {
  remaining: number
  totalLimit: number
  used: number
  delta?: number
  awarded?: number
  loaded: boolean
}

async function fetchFreeAttackStats(
  wallet: string,
  setState: Dispatch<SetStateAction<FreeAttackStatsState>>
) {
  try {
    const res = await fetch(`/api/free-attack/my?wallet=${wallet}`, { cache: 'no-store' })
    const data = await res.json().catch(() => null)

    if (!res.ok || !data?.ok) {
      setState(prev => ({ ...prev, loaded: true }))
      return { ok: false }
    }

    setState(prev => ({
      ...prev,
      loaded: true,
      remaining: data.remaining ?? 0,
      used: data.used ?? 0,
      awarded: data.awarded ?? prev.awarded ?? 0,
      totalLimit: data.totalLimit ?? prev.totalLimit ?? 2,
      delta: data.delta ?? prev.delta ?? 0.0005,
    }))

    return data
  } catch (err) {
    console.error('[QUEST] Failed to load free attack stats', err)
    setState(prev => ({ ...prev, loaded: true }))
    return { ok: false }
  }
}

export default function QuestsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QuestsPageContent />
    </Suspense>
  )
}

function QuestsPageContent() {
  const { address, isConnected } = useAccount()
  const searchParams = useSearchParams()
  const toast = useToast()
  
  const [discordId, setDiscordId] = useState<string | null>(null)
  const [checkStatus, setCheckStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [commClaimed, setCommClaimed] = useState(false)
  const [socialState, setSocialState] = useState({
    follow: false,
    tweet: false,
    claimed: false,
  })
  const [socialCountdowns, setSocialCountdowns] = useState<{ follow: number | null; tweet: number | null }>({
    follow: null,
    tweet: null,
  })
  const [socialReadyToClaim, setSocialReadyToClaim] = useState<{ follow: boolean; tweet: boolean }>({
    follow: false,
    tweet: false,
  })
  const [socialLoading, setSocialLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)
  
  // Free Attack Stats (Mock data - will be replaced with real API later)
  const [freeAttackStats, setFreeAttackStats] = useState<FreeAttackStatsState>({
    remaining: 0,
    totalLimit: 2,
    used: 0,
    delta: 0.0005,
    awarded: 0,
    loaded: false,
  })
  
  // Attack Modal State
  const [showAttackModal, setShowAttackModal] = useState(false)
  const [attackerFlag, setAttackerFlag] = useState<Flag | null>(null)
  const [targetFlag, setTargetFlag] = useState<Flag | null>(null)
  const [attackFeeInfo, setAttackFeeInfo] = useState<{
    baseFee: string;
    finalFee: string;
    isFreeAttack: boolean;
    freeAttacksRemaining: number;
  } | null>(null)
  const [attackPending, setAttackPending] = useState(false)
  const [showVictory, setShowVictory] = useState(false)
  
  // Fetch user's owned flags
  const { owned, loading: flagsLoading } = useOwnedFlags(ALL_FLAGS, address as `0x${string}`, isConnected)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const refreshFreeAttackStats = useCallback(
    async (wallet: string) => fetchFreeAttackStats(wallet, setFreeAttackStats),
    []
  )

  useEffect(() => {
    setSocialCountdowns({ follow: null, tweet: null })
    setSocialReadyToClaim({ follow: false, tweet: false })
    if (!address) {
      setCommClaimed(false)
      setSocialState({ follow: false, tweet: false, claimed: false })
      return
    }

    ;(async () => {
      try {
        const res = await fetch(`/api/quests/my?wallet=${address}`, { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (data?.ok) {
          const quests: string[] = Array.isArray(data.quests) ? data.quests : []
          const progress = data.progress ?? {}
          const socialProgress = progress[QUEST_SOCIAL_KEY] ?? {}

          setCommClaimed(quests.includes('COMMUNICATION_SPECIALIST'))

          const socialClaimed = quests.includes(QUEST_SOCIAL_KEY)
          setSocialState({
            claimed: socialClaimed,
            follow: Boolean(socialProgress.follow) || socialClaimed,
            tweet: Boolean(socialProgress.tweet) || socialClaimed,
          })
        }
      } catch (err) {
        console.error('[QUEST] failed to load my quests', err)
      }
    })()
  }, [address])

  // Fetch free attack stats from API
  useEffect(() => {
    if (address) {
      refreshFreeAttackStats(address)
    } else {
      setFreeAttackStats(prev => ({ ...prev, remaining: 0, used: 0, awarded: 0, loaded: true }))
    }
  }, [address, refreshFreeAttackStats])
  
  // Auto-select first owned flag when modal opens
  useEffect(() => {
    if (showAttackModal && owned.length > 0 && !attackerFlag) {
      const ownedFlag = ALL_FLAGS.find(f => f.id === owned[0].id)
      if (ownedFlag) setAttackerFlag(ownedFlag)
    }
  }, [showAttackModal, owned, attackerFlag])
  
  // Calculate attack fee when flags are selected
  useEffect(() => {
    if (!showAttackModal || !attackerFlag || !targetFlag || !address) {
      setAttackFeeInfo(null)
      return
    }
    
    const calculateFee = async () => {
      try {
        const feeInfo = await estimateAttackFee(attackerFlag.id, targetFlag.id, address)
        setAttackFeeInfo({
          baseFee: feeInfo.baseFee,
          finalFee: feeInfo.finalFee,
          isFreeAttack: feeInfo.isFreeAttack || false,
          freeAttacksRemaining: feeInfo.freeAttacksRemaining || 0
        })
      } catch (error) {
        console.error('[QUEST ATTACK] Error calculating attack fee:', error)
        setAttackFeeInfo(null)
      }
    }
    
    calculateFee()
  }, [showAttackModal, attackerFlag, targetFlag, address])
  
  // Handle attack execution
  const handleExecuteAttack = async () => {
    if (!address || !attackerFlag || !targetFlag || attackPending) return

    // Refresh free attack stats right before execution
    const validationData = await refreshFreeAttackStats(address)
    const remainingBeforeAttack = validationData?.remaining ?? freeAttackStats.remaining
    if (!validationData?.ok || remainingBeforeAttack <= 0) {
      toast.push({ type: 'error', text: 'No free attacks left. Claim a quest first.', ttl: 4000 })
      return
    }

    // Validation
    if (attackerFlag.id === targetFlag.id) {
      toast.push({ type: 'error', text: 'You cannot attack the same flag', ttl: 5000 })
      return
    }
    
    const myFlag = owned.find(o => o.id === attackerFlag.id)
    if (!myFlag) {
      toast.push({ type: 'error', text: 'Selected attacker flag is not in your balance', ttl: 5000 })
      return
    }
    const prevUsed = freeAttackStats.used ?? 0
    const prevRemaining = freeAttackStats.remaining ?? 0

    try {
      await requireBaseSepolia()
      
      setAttackPending(true)
      toast.push({ type: 'info', text: 'Preparing attack...', ttl: 3000 })
      
      const amountWei = parseEther('1')
      
      // Check if we need USDC allowance (only if not free attack)
      // Contract will automatically apply free attack if available, but we still need allowance
      // in case free attack is not available
      const estimatedFee = BigInt(attackFeeInfo?.finalFee || '0')
      
      if (estimatedFee > 0n) {
        const currentAllowance = await guardedRead({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, CORE_ADDRESS]
        }) as bigint
        
        if (currentAllowance < estimatedFee) {
          toast.push({ type: 'info', text: 'Approving USDC...', ttl: 3000 })
          const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
          const approveHash = await guardedWrite({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'approve',
            args: [CORE_ADDRESS, maxAmount]
          }) as `0x${string}`
          await guardedWaitSafe({ hash: approveHash, timeout: 60000, pollingInterval: 1000 })
          toast.push({ type: 'success', text: 'USDC approved!', ttl: 2000 })
        }
      }
      
      // Execute attack (contract will automatically apply free attack if available)
      toast.push({ type: 'info', text: 'Executing attack...', ttl: 5000 })
      
      const txHash = await guardedWrite({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'attack',
        args: [
          BigInt(attackerFlag.id),
          BigInt(targetFlag.id),
          amountWei
        ]
      }) as `0x${string}`
      
      toast.push({ type: 'info', text: 'Waiting for confirmation...', ttl: 10000 })
      
      const receipt = await guardedWaitSafe({ hash: txHash, timeout: 120000, pollingInterval: 1000 })
      
      if (receipt.status === 'success') {
        setShowVictory(true)
        toast.push({ type: 'success', text: '⚔️ Attack successful!', ttl: 5000 })

        setFreeAttackStats(prev => {
          if (!prev.loaded) return prev
          const totalLimit = prev.totalLimit ?? 0
          const awarded = prev.awarded ?? totalLimit
          const maxUsable = Math.min(awarded, totalLimit)
          const remaining = Math.max(0, (prev.remaining ?? 0) - 1)
          const used = Math.min((prev.used ?? 0) + 1, maxUsable)
          return {
            ...prev,
            remaining,
            used,
            loaded: true
          }
        })

        // Record achievement
        fetch('/api/achievements/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'attack',
            targetCountryId: targetFlag.id,
          })
        }).catch(() => {})
        
        fetch('/api/queue/attack-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: address,
            fromId: attackerFlag.id,
            toId: targetFlag.id,
            amountToken18: amountWei.toString(),
            txHash,
            blockNumber: receipt.blockNumber?.toString() ?? '0',
            feeUSDC6: '0', // Free attack, fee is 0
            timestamp: Date.now()
          })
        }).catch(() => {})

        const verifyResult = await fetch('/api/attacks/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, user: address, feeUSDC6: 0 }),
          credentials: 'include'
        }).then(res => res.json().catch(() => null)).catch(() => null)

        let consumed = !!verifyResult?.result?.consumed
        if (!consumed) {
          const fresh = await refreshFreeAttackStats(address)
          if (fresh?.ok) {
            const remoteUsed = fresh.used ?? prevUsed
            const remoteRemaining = fresh.remaining ?? prevRemaining
            consumed = remoteUsed > prevUsed || remoteRemaining < prevRemaining
          }
        } else {
          await refreshFreeAttackStats(address)
        }

        if (!consumed) {
          toast.push({ type: 'info', text: 'Free attack consumption delayed. Please verify shortly.', ttl: 8000 })
        } else {
          toast.push({ type: 'success', text: 'Free attack consumption confirmed.', ttl: 4000 })
        }
      } else {
        toast.push({ type: 'error', text: 'Attack transaction failed', ttl: 5000 })
      }
      
    } catch (error: any) {
      console.error('[QUEST ATTACK] Error:', error)
      toast.push({ type: 'error', text: error?.message || 'Attack failed', ttl: 5000 })
    }

    setAttackPending(false)
    setShowAttackModal(false)
    setAttackerFlag(null)
    setTargetFlag(null)
  }

  // OAuth URL
  const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '1434579419573518376'
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL 
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/discord`
    : 'http://localhost:3000/api/auth/callback/discord'
  
  const oauthUrl = `https://discord.com/oauth2/authorize?response_type=code&client_id=${discordClientId}&scope=identify&redirect_uri=${encodeURIComponent(redirectUri)}`

  useEffect(() => {
    const id = searchParams?.get('discordId')
    const oauthStatus = searchParams?.get('discord_oauth')

    // 1) If discordId is present in URL, always remember it (treat as connected)
    if (id) {
      setDiscordId(id)
    }

    // 2) If OAuth completed successfully, clear the error and remove only discord_oauth from URL
    if (oauthStatus === 'ok') {
      setOauthError(null)
      try {
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('discord_oauth')
          // Keep discordId param to preserve connected state on refresh
          window.history.replaceState({}, '', url.toString())
        }
      } catch {}
    } else if (oauthStatus?.startsWith('error')) {
      console.error('Discord OAuth error:', oauthStatus)
      const errorMessages: Record<string, string> = {
        'error_env': 'Configuration error. Please contact support.',
        'error_missing_code': 'OAuth callback failed. Please try again.',
        'token_error': 'Discord authentication failed. Please try again.',
        'user_error': 'Could not fetch Discord user info. Please try again.',
        'exception': 'An unexpected error occurred. Please try again.',
        'error': 'Discord connection failed. Please try again.'
      }
      setOauthError(errorMessages[oauthStatus] || 'Discord connection failed. Please try again.')
    } else {
      setOauthError(null)
    }
  }, [searchParams])

  const handleCheck = async () => {
    if (!address || !discordId) return

    setLoading(true)
    try {
      const res = await fetch('/api/quests/check-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ userId: address, discordId })
      })
      const data = await res.json()
      setCheckStatus(data)
      if (data?.claimed === true) {
        setCommClaimed(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    if (!address || !discordId) return

    setLoading(true)
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ wallet: address, discordId })
      })
      const data = await res.json()
      
      // Debug log
      console.log('[QUEST CLAIM] Response:', data)
      
      setCheckStatus((prev: any) => {
        if (!prev) return data
        return {
          ...prev,
          ...(data ?? {}),
          ...(data?.steps
            ? { steps: { ...(prev?.steps ?? {}), ...data.steps } }
            : {}),
          ...(data?.progress
            ? { progress: { ...(prev?.progress ?? {}), ...data.progress } }
            : {}),
        }
      })
      
      // Hata durumları
      if (!data?.ok) {
        const errorMsg = data?.error || data?.message || 'Claim failed. Please try again.'
        toast.push({ type: 'error', text: errorMsg, ttl: 4000 })
        console.error('[QUEST CLAIM] Error:', data)
        return
      }
      
      // Zaten claim edilmiş durumu
      if (data?.code === 'ALREADY_CLAIMED' || data?.claimed === true) {
        // Backend'den quest durumunu tekrar çek
        try {
          const questRes = await fetch(`/api/quests/my?wallet=${address}`, { cache: 'no-store' })
          const questData = await questRes.json().catch(() => null)
          if (questData?.ok) {
            const quests: string[] = Array.isArray(questData.quests) ? questData.quests : []
            setCommClaimed(quests.includes('COMMUNICATION_SPECIALIST'))
          } else {
            setCommClaimed(true)
          }
        } catch {
          setCommClaimed(true)
        }
        await refreshFreeAttackStats(address)
        const msg = data?.code === 'ALREADY_CLAIMED' 
          ? 'You have already completed this quest.'
          : 'Quest completed! Enjoy your free attack.'
        toast.push({ 
          type: data?.code === 'ALREADY_CLAIMED' ? 'info' : 'success', 
          text: msg, 
          ttl: 4000 
        })
        return
      }
      
      // Diğer durumlar
      if (data?.message) {
        toast.push({ type: 'error', text: data.message, ttl: 4000 })
      } else {
        toast.push({ type: 'error', text: 'Unexpected response from server.', ttl: 4000 })
      }
    } catch (err) {
      console.error(err)
      toast.push({ type: 'error', text: 'Claim failed. Please try again.', ttl: 4000 })
    } finally {
      setLoading(false)
    }
  }

  const applySocialResponse = useCallback((data: any) => {
    if (!data) return
    const progress = data.progress ?? data.steps ?? {}
    const claimed = Boolean(data.claimed)
    setSocialState(prev => {
      const followValue =
        typeof progress.follow === 'boolean'
          ? progress.follow
          : claimed
            ? true
            : prev.follow
      const tweetValue =
        typeof progress.tweet === 'boolean'
          ? progress.tweet
          : claimed
            ? true
            : prev.tweet

      return {
        follow: followValue,
        tweet: tweetValue,
        claimed: claimed || prev.claimed,
      }
    })
  }, [])

  const sendSocialRequest = useCallback(
    async (method: 'follow' | 'tweet' | 'claim') => {
      if (!address) {
        toast.push({ type: 'error', text: 'Connect your wallet first.', ttl: 4000 })
        return null
      }
      try {
        const res = await fetch('/api/quests/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({
            wallet: address,
            type: QUEST_SOCIAL_KEY,
            meta: { method },
          }),
        })
        const data = await res.json().catch(() => null)
        applySocialResponse(data)
        if (!data?.ok) {
          if (data?.error === 'RATE_LIMIT_EXCEEDED') {
            toast.push({ type: 'info', text: 'Too many attempts. Please wait and try again.', ttl: 4000 })
          } else if (data?.error) {
            toast.push({ type: 'error', text: data.error, ttl: 4000 })
          } else {
            toast.push({ type: 'error', text: 'Quest update failed. Please try again.', ttl: 4000 })
          }
          return data
        }

        if (method === 'follow' || method === 'tweet') {
          setSocialCountdowns(prev => ({ ...prev, [method]: null }))
          setSocialReadyToClaim(prev => ({ ...prev, [method]: false }))
        }

        if (data?.code === 'ALREADY_CLAIMED') {
          toast.push({ type: 'info', text: 'You have already completed this quest.', ttl: 4000 })
        } else if (data?.code === 'MISSING_STEPS') {
          toast.push({ type: 'info', text: 'Complete both actions before claiming.', ttl: 4000 })
        } else if (data?.code === 'NO_FLAGS') {
          toast.push({ type: 'error', text: data?.message || 'You must own at least one flag to claim this quest.', ttl: 4000 })
        } else if (data?.freeGiven) {
          toast.push({ type: 'success', text: 'Quest completed! Free attack awarded.', ttl: 4000 })
        }
        if (data?.claimed && !data?.freeGiven) {
          toast.push({ type: 'info', text: 'Quest completed, but free attack limit already reached.', ttl: 4000 })
        }
        if (data?.claimed && address) {
          setSocialState(prev => ({ ...prev, claimed: true, follow: true, tweet: true }))
          await refreshFreeAttackStats(address)
        }
        return data
      } catch (err) {
        console.error('[SOCIAL QUEST] request failed', err)
        toast.push({ type: 'error', text: 'Quest update failed. Please try again.', ttl: 4000 })
        return null
      }
    },
    [address, applySocialResponse, refreshFreeAttackStats, toast]
  )

  const handleSocialLink = useCallback(
    (type: 'follow' | 'tweet') => {
      if (!address) {
        toast.push({ type: 'error', text: 'Connect your wallet first.', ttl: 4000 })
        return
      }

      const alreadyDone = type === 'follow' ? socialState.follow : socialState.tweet
      if (alreadyDone) {
        toast.push({ type: 'info', text: 'This step is already completed.', ttl: 3000 })
        return
      }

      const url =
        type === 'follow'
          ? 'https://x.com/intent/follow?screen_name=flagbasefun'
          : 'https://x.com/intent/tweet?text=%40flagbasefun%20%23FlagBase'

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)

      setSocialReadyToClaim(prev => ({ ...prev, [type]: false }))
      setSocialCountdowns(prev => ({
        ...prev,
        [type]: 30,
      }))

      toast.push({
        type: 'info',
        text: 'Countdown started. You can reopen the link if needed.',
        ttl: 3500,
      })
    },
    [address, socialState.follow, socialState.tweet, toast]
  )

  const handleSocialClaim = useCallback(async () => {
    if (!address) {
      toast.push({ type: 'error', text: 'Connect your wallet first.', ttl: 4000 })
      return
    }
    if (!(socialState.follow && socialState.tweet)) {
      toast.push({ type: 'info', text: 'Complete both steps before claiming.', ttl: 4000 })
      return
    }
    if (owned.length === 0) {
      toast.push({ type: 'error', text: 'You must own at least one flag to claim this quest.', ttl: 4000 })
      return
    }
    setSocialLoading(true)
    try {
      const data = await sendSocialRequest('claim')
      if (data?.code === 'MISSING_STEPS' || data?.code === 'NO_FLAGS') return
      if (!data?.ok) {
        toast.push({ type: 'error', text: data?.message || 'Claim failed. Please try again.', ttl: 4000 })
      }
    } finally {
      setSocialLoading(false)
    }
  }, [address, sendSocialRequest, socialState.follow, socialState.tweet, owned.length, toast])

  const handleSocialStepConfirm = useCallback(
    async (type: 'follow' | 'tweet') => {
      if (!address) {
        toast.push({ type: 'error', text: 'Connect your wallet first.', ttl: 4000 })
        return
      }
      setSocialReadyToClaim(prev => ({ ...prev, [type]: false }))
      const data = await sendSocialRequest(type)
      if (!data?.ok) {
        setSocialReadyToClaim(prev => ({ ...prev, [type]: true }))
        return
      }
      setSocialCountdowns(prev => ({ ...prev, [type]: null }))
      const isAlreadyDone = type === 'follow' ? socialState.follow : socialState.tweet
      if (!isAlreadyDone) {
        setSocialState(prev => ({
          ...prev,
          [type]: true,
        }) as typeof prev)
      }
      toast.push({
        type: 'success',
        text: type === 'follow' ? 'Follow confirmed.' : 'Tweet confirmed.',
        ttl: 3000,
      })
    },
    [address, sendSocialRequest, socialState.follow, socialState.tweet, toast]
  )

  const hasActiveCountdown =
    (typeof socialCountdowns.follow === 'number' && socialCountdowns.follow > 0) ||
    (typeof socialCountdowns.tweet === 'number' && socialCountdowns.tweet > 0)

  useEffect(() => {
    if (!hasActiveCountdown) return
    let cancelled = false

    const interval = window.setInterval(() => {
      if (cancelled) return
      
      setSocialCountdowns(prev => {
        const next = { ...prev }
        const readyTypes: Array<'follow' | 'tweet'> = []
        let changed = false
        
        ;(['follow', 'tweet'] as const).forEach(type => {
          const current = prev[type]
          if (typeof current !== 'number' || current <= 0) return
          
          if (current <= 1) {
            // Countdown bitti, null yap ki showCountdown false olsun ve showConfirm true olsun
            console.log(`[COUNTDOWN] ${type} finished, setting to null`)
            next[type] = null
            readyTypes.push(type)
            changed = true
          } else {
            next[type] = current - 1
            changed = true
          }
        })
        
        // Countdown bitti, readyToClaim'i true yap (callback içinde direkt çağır)
        if (readyTypes.length > 0 && !cancelled) {
          console.log(`[COUNTDOWN] Setting readyToClaim to true for:`, readyTypes)
          // setTimeout ile bir sonraki tick'te çağır ki state update'ler çakışmasın
          setTimeout(() => {
            setSocialReadyToClaim(prev => {
              const next = { ...prev }
              readyTypes.forEach(type => {
                next[type] = true
              })
              console.log(`[COUNTDOWN] New readyToClaim state:`, next)
              return next
            })
          }, 0)
        }
        
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [hasActiveCountdown])

  const handleOpenAttackModal = useCallback(async () => {
    if (!address) return
    const data = await refreshFreeAttackStats(address)
    const remaining = data?.remaining ?? freeAttackStats.remaining
    if (!data?.ok || remaining <= 0) {
      toast.push({ type: 'error', text: 'You have no free attacks left', ttl: 4000 })
      return
    }
    setShowVictory(false)
    setShowAttackModal(true)
  }, [address, refreshFreeAttackStats, freeAttackStats.remaining, toast])

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return null
  }

  if (!address) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            background: 'var(--bg-panel)',
            padding: '2rem',
            borderRadius: '1rem',
            border: '1px solid var(--stroke)',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h1 style={{ marginBottom: '1rem' }}>🎯 Quests</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Connect your wallet to complete quests and earn rewards
          </p>
          <ConnectAndLogin />
        </div>
      </div>
    )
  }

  const allRequirementsMet = checkStatus?.ok === true
  const socialReady = socialState.follow && socialState.tweet
  const socialCompleted = socialState.claimed
  const discordConnected = !!discordId
  const hasAtLeastOneFlag = owned.length > 0
  const noFreeLeft = freeAttackStats.loaded && freeAttackStats.remaining <= 0
  const effectiveMax = freeAttackStats.loaded
    ? Math.max(0, Math.min(freeAttackStats.awarded ?? freeAttackStats.totalLimit, freeAttackStats.totalLimit))
    : freeAttackStats.totalLimit
  const totalLimitDisplay = freeAttackStats.loaded
    ? freeAttackStats.totalLimit ?? effectiveMax ?? 0
    : freeAttackStats.totalLimit
  const progressPercent = freeAttackStats.loaded && totalLimitDisplay && totalLimitDisplay > 0
    ? (freeAttackStats.remaining / totalLimitDisplay) * 100
    : 0
  const freeRemainingLabel = freeAttackStats.loaded
    ? `${freeAttackStats.remaining} / ${totalLimitDisplay || 0}`
    : 'Loading...'
  const isQuestCompleted = commClaimed === true
 
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header with Free Attack Stats */}
      <div style={{ 
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '0.5rem', background: 'linear-gradient(135deg, var(--gold), var(--amber))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            🎯 Quests
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            Complete quests to earn free attacks and special rewards
          </p>
        </div>
        
        {/* Free Attack Stats Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 140, 0, 0.1))',
          border: '2px solid var(--gold)',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          minWidth: '200px',
          boxShadow: '0 4px 20px rgba(255, 215, 0, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '1.5rem' }}>⚔️</div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                Free Attacks
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gold)' }}>
                {freeRemainingLabel}
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--bg-panel-soft)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '0.5rem'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: freeAttackStats.loaded && freeAttackStats.remaining > 0 
                ? 'linear-gradient(90deg, var(--gold), var(--amber))'
                : 'var(--stroke)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          
          <div style={{ 
            fontSize: '0.7rem', 
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>Used: {freeAttackStats.loaded ? freeAttackStats.used : '...'}</span>
            <span>Available: {freeAttackStats.loaded ? freeAttackStats.remaining : '...'}</span>
          </div>
          {freeAttackStats.loaded && typeof freeAttackStats.delta === 'number' && (
            <div style={{
              marginTop: '0.75rem',
              fontSize: '0.7rem',
              color: 'var(--text-muted)'
            }}>
              Price delta per free attack: ±{freeAttackStats.delta}
            </div>
          )}
        </div>
      </div>

      {/* Quest Card */}
      <div
        style={{
          background: commClaimed 
            ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.05))'
            : 'var(--bg-panel)',
          border: commClaimed 
            ? '2px solid var(--gold)' 
            : allRequirementsMet && !commClaimed
              ? '2px solid var(--amber)'
              : '1px solid var(--stroke)',
          borderRadius: '1.5rem',
          padding: '2.5rem',
          marginBottom: '2rem',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: commClaimed 
            ? '0 8px 32px rgba(255, 215, 0, 0.2)'
            : allRequirementsMet && !commClaimed
              ? '0 4px 20px rgba(255, 140, 0, 0.15)'
              : 'none',
          transition: 'all 0.3s ease'
        }}
      >
        {/* Background decoration */}
        {commClaimed && (
          <>
            <div
              style={{
                position: 'absolute',
                top: '-80px',
                right: '-80px',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%)',
                borderRadius: '50%',
                animation: 'pulse 3s ease-in-out infinite'
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '-60px',
                left: '-60px',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(255, 140, 0, 0.15) 0%, transparent 70%)',
                borderRadius: '50%',
              }}
            />
          </>
        )}
        
        {/* Completed Badge */}
        {commClaimed && (
          <div style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            background: 'var(--gold)',
            color: 'var(--text-dark)',
            padding: '0.5rem 1rem',
            borderRadius: '2rem',
            fontSize: '0.75rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
            zIndex: 10
          }}>
            <span>✓</span>
            <span>COMPLETED</span>
          </div>
        )}

        {/* Quest Header */}
        <div style={{ position: 'relative', marginBottom: '2rem', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ 
              fontSize: '4rem',
              filter: commClaimed ? 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))' : 'none',
              transition: 'all 0.3s ease'
            }}>
              💬
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ 
                  fontSize: '2rem', 
                  fontWeight: 'bold', 
                  margin: 0,
                  color: commClaimed ? 'var(--gold)' : 'var(--text-primary)',
                  transition: 'color 0.3s ease'
                }}>
                  Communication Specialist
                </h2>
                {!commClaimed && (
                  <div
                    style={{
                      display: 'inline-block',
                      background: allRequirementsMet 
                        ? 'linear-gradient(135deg, var(--amber), var(--orange))'
                        : 'var(--bg-panel-soft)',
                      color: allRequirementsMet ? 'var(--text-dark)' : 'var(--text-secondary)',
                      padding: '0.375rem 1rem',
                      borderRadius: '2rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {allRequirementsMet ? 'Ready to Claim' : 'In Progress'}
                  </div>
                )}
              </div>
              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '1rem',
                lineHeight: '1.6',
                margin: 0
              }}>
                Join Flag Base Discord, hold a Flag, get the Flag Folks role to earn a free attack.
              </p>
            </div>
          </div>
        </div>

        {/* Rewards Badge */}
        <div
          style={{
            background: commClaimed
              ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 0, 0.1))'
              : 'linear-gradient(135deg, var(--bg-panel-soft), rgba(255, 215, 0, 0.05))',
            border: commClaimed 
              ? '2px solid var(--gold)'
              : '1px solid var(--stroke)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {commClaimed && (
            <div style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)',
              borderRadius: '50%'
            }} />
          )}
          <div style={{ 
            fontSize: '2.5rem',
            filter: commClaimed ? 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))' : 'none',
            zIndex: 1
          }}>
            🎁
          </div>
          <div style={{ flex: 1, zIndex: 1 }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: 'var(--gold)',
              marginBottom: '0.25rem'
            }}>
              Reward: 1 Free Attack
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {commClaimed
                ? '✓ Reward claimed! You can launch your free attack below.'
                : 'Use it to attack any country without paying fees'
              }
            </div>
            {commClaimed && freeAttackStats.loaded && freeAttackStats.remaining > 0 && (
              <p
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)'
                }}
              >
                You have a free attack ready. Launch it below 👇
              </p>
            )}
          </div>
        </div>

        {/* Requirements */}
        {isQuestCompleted ? (
          <div
            style={{
              background: 'var(--bg-panel-soft)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: '1rem',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>📋</span>
              <span style={{ color: 'var(--gold)' }}>This quest is completed for this wallet.</span>
            </h3>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-panel-soft)',
              border: allRequirementsMet ? '2px solid var(--amber)' : '1px solid var(--stroke)',
              borderRadius: '1rem',
              padding: '1.5rem',
              marginBottom: '2rem',
              position: 'relative'
            }}
          >
            <h3 style={{ 
              fontSize: '1rem', 
              fontWeight: '600', 
              marginBottom: '1.25rem', 
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>📋</span>
              <span>Requirements</span>
              {allRequirementsMet && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.75rem',
                  color: 'var(--amber)',
                  fontWeight: '700'
                }}>
                  All Complete! ✓
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <RequirementItem
                icon={discordConnected ? '✅' : '⚪'}
                text="Connect Discord account"
                met={discordConnected}
                completed={commClaimed}
              />
              <RequirementItem
                icon={checkStatus?.member ? '✅' : '⚪'}
                text="Join Flag Base Discord server"
                met={checkStatus?.member}
                completed={commClaimed}
              />
              <RequirementItem
                icon={checkStatus?.hasRole ? '✅' : '⚪'}
                text="Get Flag Folks role"
                met={checkStatus?.hasRole}
                completed={commClaimed}
              />
              <RequirementItem
                icon={checkStatus?.hasFlag ? '✅' : '⚪'}
                text="Own at least 1 flag"
                met={checkStatus?.hasFlag}
                completed={commClaimed}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
          {!discordConnected && !isQuestCompleted ? (
            <a
              href={oauthUrl}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--gold)',
                color: 'var(--text-dark)',
                borderRadius: '0.75rem',
                textDecoration: 'none',
                fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#d4a017' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--gold)' }}
            >
              <span style={{ fontSize: '1.25rem' }}>🔗</span>
              Connect Discord
            </a>
          ) : isQuestCompleted ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--gold)',
                color: 'var(--text-dark)',
                borderRadius: '0.75rem',
                fontWeight: '600',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>✅</span>
              Quest Completed!
            </div>
          ) : (
            <>
              <button
                onClick={handleCheck}
                disabled={loading || commClaimed}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '1rem 1.5rem',
                  background: loading ? 'var(--bg-panel-soft)' : 'var(--bg-panel-soft)',
                  color: loading ? 'var(--text-muted)' : 'var(--text-primary)',
                  border: '1px solid var(--stroke)',
                  borderRadius: '0.75rem',
                  cursor: loading || commClaimed ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!loading && !commClaimed) {
                    e.currentTarget.style.background = 'var(--stroke)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && !commClaimed) {
                    e.currentTarget.style.background = 'var(--bg-panel-soft)'
                  }
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Checking...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '1.25rem' }}>🔍</span>
                    Check Status
                  </>
                )}
              </button>

              {allRequirementsMet && !commClaimed && (
                <button
                  onClick={handleClaim}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.5rem',
                    background: 'var(--gold)',
                    color: 'var(--text-dark)',
                    border: 'none',
                    borderRadius: '0.75rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = '#d4a017'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = 'var(--gold)'
                    }
                  }}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      Claiming...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.25rem' }}>🎁</span>
                      Claim Free Attack
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* OAuth Error Messages */}
        {oauthError && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255, 0, 0, 0.1)',
              border: '1px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#ff6b6b',
              textAlign: 'center',
            }}
          >
            ⚠️ {oauthError}
          </div>
        )}

        {/* Status Messages */}
        {checkStatus?.message && checkStatus?.ok !== undefined && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: allRequirementsMet ? 'rgba(255, 215, 0, 0.1)' : 'var(--bg-panel-soft)',
              border: `1px solid ${allRequirementsMet ? 'var(--gold)' : 'var(--stroke)'}`,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: allRequirementsMet ? 'var(--gold)' : 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            {checkStatus.message}
          </div>
        )}
      </div>

      <div
        style={{
          height: '1px',
          background: 'var(--stroke)',
          opacity: 0.4,
          margin: '3rem 0 2rem',
        }}
      />

      <div
        style={{
          background: socialCompleted
            ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 0, 0.1))'
            : 'var(--bg-panel)',
          border: socialCompleted ? '2px solid var(--gold)' : '1px solid var(--stroke)',
          borderRadius: '1.5rem',
          padding: '2.25rem',
          marginBottom: '2rem',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        {socialCompleted && (
          <div
            style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }}
          />
        )}
        
        {/* Completed Badge */}
        {socialCompleted && (
          <div style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            background: 'var(--gold)',
            color: 'var(--text-dark)',
            padding: '0.5rem 1rem',
            borderRadius: '2rem',
            fontSize: '0.75rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
            zIndex: 10
          }}>
            <span>✓</span>
            <span>COMPLETED</span>
          </div>
        )}
        {/* Quest Header */}
        <div style={{ position: 'relative', marginBottom: '2rem', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ 
              fontSize: '4rem',
              filter: socialCompleted ? 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))' : 'none',
              transition: 'all 0.3s ease'
            }}>
              🕊️
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ 
                  fontSize: '2rem', 
                  fontWeight: 'bold', 
                  margin: 0,
                  color: socialCompleted ? 'var(--gold)' : 'var(--text-primary)',
                  transition: 'color 0.3s ease'
                }}>
                  Social Warrior
                </h2>
                {!socialCompleted && (
                  <div
                    style={{
                      display: 'inline-block',
                      background: socialReady && hasAtLeastOneFlag
                        ? 'linear-gradient(135deg, var(--amber), var(--orange))'
                        : 'var(--bg-panel-soft)',
                      color: socialReady && hasAtLeastOneFlag ? 'var(--text-dark)' : 'var(--text-secondary)',
                      padding: '0.375rem 1rem',
                      borderRadius: '2rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {socialReady && hasAtLeastOneFlag ? 'Ready to Claim' : 'In Progress'}
                  </div>
                )}
              </div>
              <p style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '1rem',
                lineHeight: '1.6',
                margin: 0
              }}>
                Follow <strong>@flagbasefun</strong> on X and share the hype with{' '}
                <strong>#FlagBase</strong> to unlock an extra free attack.
              </p>
            </div>
          </div>
        </div>

        {/* Rewards Badge */}
        <div
          style={{
            background: socialCompleted
              ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 140, 0, 0.1))'
              : 'linear-gradient(135deg, var(--bg-panel-soft), rgba(255, 215, 0, 0.05))',
            border: socialCompleted 
              ? '2px solid var(--gold)'
              : '1px solid var(--stroke)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {socialCompleted && (
            <div style={{
              position: 'absolute',
              top: '-20px',
              right: '-20px',
              width: '100px',
              height: '100px',
              background: 'radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%)',
              borderRadius: '50%'
            }} />
          )}
          <div style={{ 
            fontSize: '2.5rem',
            filter: socialCompleted ? 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))' : 'none',
            zIndex: 1
          }}>
            🎁
          </div>
          <div style={{ flex: 1, zIndex: 1 }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: 'var(--gold)',
              marginBottom: '0.25rem'
            }}>
              Reward: 1 Free Attack
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {socialCompleted
                ? '✓ Reward claimed! You can launch your free attack below.'
                : 'Use it to attack any country without paying fees'
              }
            </div>
            {socialCompleted && freeAttackStats.loaded && freeAttackStats.remaining > 0 && (
              <p
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)'
                }}
              >
                You have a free attack ready. Launch it below 👇
              </p>
            )}
          </div>
        </div>

        {/* Requirements */}
        {socialCompleted ? (
          <div
            style={{
              background: 'var(--bg-panel-soft)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: '1rem',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>📋</span>
              <span style={{ color: 'var(--gold)' }}>This quest is completed for this wallet.</span>
            </h3>
          </div>
        ) : (
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            <RequirementItem
              icon={socialState.follow ? '✅' : '⚪'}
              text="Follow @flagbasefun on X"
              met={socialState.follow}
              completed={socialCompleted}
              action={{
                label: 'Follow on X',
                onClick: () => handleSocialLink('follow'),
                disabled: socialCompleted,
              }}
              countdownSeconds={typeof socialCountdowns.follow === 'number' ? socialCountdowns.follow : null}
              readyToConfirm={socialReadyToClaim.follow}
              confirmLabel="Confirm Follow"
              onConfirm={() => handleSocialStepConfirm('follow')}
            />
            <RequirementItem
              icon={socialState.tweet ? '✅' : '⚪'}
              text="Tweet mentioning @flagbasefun with #FlagBase"
              met={socialState.tweet}
              completed={socialCompleted}
              action={{
                label: 'Tweet #FlagBase',
                onClick: () => handleSocialLink('tweet'),
                disabled: socialCompleted,
              }}
              countdownSeconds={typeof socialCountdowns.tweet === 'number' ? socialCountdowns.tweet : null}
              readyToConfirm={socialReadyToClaim.tweet}
              confirmLabel="Confirm Tweet"
              onConfirm={() => handleSocialStepConfirm('tweet')}
            />
            <RequirementItem
              icon={hasAtLeastOneFlag ? '✅' : '⚪'}
              text="Own at least one flag"
              met={hasAtLeastOneFlag}
              completed={socialCompleted}
            />
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 1 }}>
          {socialCompleted ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--gold)',
                color: 'var(--text-dark)',
                borderRadius: '0.75rem',
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>✅</span>
              Quest Completed!
            </div>
          ) : (
            <button
              onClick={handleSocialClaim}
              disabled={!socialReady || !hasAtLeastOneFlag || socialLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: socialReady && hasAtLeastOneFlag ? 'var(--gold)' : 'var(--bg-panel-soft)',
                color: socialReady && hasAtLeastOneFlag ? 'var(--text-dark)' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: !socialReady || !hasAtLeastOneFlag || socialLoading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!socialReady || !hasAtLeastOneFlag || socialLoading) return
                e.currentTarget.style.background = '#d4a017'
              }}
              onMouseLeave={(e) => {
                if (!socialReady || !hasAtLeastOneFlag || socialLoading) return
                e.currentTarget.style.background = 'var(--gold)'
              }}
            >
              {socialLoading ? (
                <>
                  <span className="spinner"></span>
                  Claiming...
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.25rem' }}>🎁</span>
                  Claim Free Attack
                </>
              )}
            </button>
          )}
        </div>

        <p
          style={{
            marginTop: '1.25rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            position: 'relative',
            zIndex: 1,
          }}
        >
          Each link opens in a new tab and starts a 30-second countdown here. If you close the tab, simply click the
          link again to restart the countdown, then press the confirm button when it appears.
        </p>
      </div>

      {/* Info Panel */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--stroke)',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
          Quest Rules
        </h3>
        <ul style={{
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
          lineHeight: '2',
          margin: 0,
          paddingLeft: '1.5rem',
          listStyleType: 'none',
        }}>
          <li style={{ position: 'relative', paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--gold)' }}>•</span>
            Maximum <strong style={{ color: 'var(--gold)' }}>2 free attacks</strong> can be claimed in total
          </li>
          <li style={{ position: 'relative', paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--gold)' }}>•</span>
            Each user can claim this quest <strong style={{ color: 'var(--text-primary)' }}>only once</strong>
          </li>
          <li style={{ position: 'relative', paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--gold)' }}>•</span>
            Free attacks can be used for <strong style={{ color: 'var(--text-primary)' }}>any attack action</strong>
          </li>
          <li style={{ position: 'relative', paddingLeft: '1.5rem' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--gold)' }}>•</span>
            Use your free attacks in the <Link href="/attack" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Attack page</Link>
          </li>
        </ul>
      </div>
      
      {/* How to Use Free Attacks Section */}
      {freeAttackStats.loaded && freeAttackStats.remaining > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 140, 0, 0.05))',
            border: '2px solid var(--gold)',
            borderRadius: '1rem',
            padding: '2rem',
            marginBottom: '2rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '2rem' }}>⚔️</div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--gold)', marginBottom: '0.25rem' }}>
                How to Use Your Free Attacks
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                You have {freeAttackStats.remaining} free attack{freeAttackStats.remaining > 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          
          <div style={{
            background: 'var(--bg-panel)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1rem'
          }}>
            <ol style={{
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              lineHeight: '2',
              margin: 0,
              paddingLeft: '1.5rem'
            }}>
              <li style={{ marginBottom: '0.75rem' }}>
                Click "Launch Attack Now" button below
              </li>
              <li style={{ marginBottom: '0.75rem' }}>
                Select your attacking country and target country in the modal
              </li>
              <li style={{ marginBottom: '0.75rem' }}>
                Choose the amount of tokens to attack with
              </li>
              <li>
                Your free attack will be automatically applied - <strong style={{ color: 'var(--gold)' }}>no fees charged!</strong>
              </li>
            </ol>
          </div>
          
          <button
            onClick={handleOpenAttackModal}
            disabled={noFreeLeft}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '1rem 2rem',
              background: !noFreeLeft ? 'var(--gold)' : 'var(--stroke)',
              color: !noFreeLeft ? 'var(--text-dark)' : 'var(--text-muted)',
              borderRadius: '0.75rem',
              border: 'none',
              fontWeight: '700',
              fontSize: '1rem',
              transition: 'all 0.2s',
              width: '100%',
              textAlign: 'center',
              cursor: !noFreeLeft ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={(e) => { 
              if (!noFreeLeft) {
                e.currentTarget.style.background = '#d4a017'; 
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 215, 0, 0.4)';
              }
            }}
            onMouseLeave={(e) => { 
              if (!noFreeLeft) {
                e.currentTarget.style.background = 'var(--gold)'; 
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <span>⚔️</span>
            <span>
              {freeAttackStats.loaded
                ? (noFreeLeft ? 'No Free Attacks Available' : 'Launch Attack Now')
                : 'Checking Free Attacks...'}
            </span>
            {!noFreeLeft && freeAttackStats.loaded && <span>→</span>}
          </button>
        </div>
      )}

      {/* Attack Modal */}
      {showAttackModal && (
        <AttackModal
          owned={owned}
          attackerFlag={attackerFlag}
          targetFlag={targetFlag}
          attackFeeInfo={attackFeeInfo}
          attackPending={attackPending}
          onAttackerSelect={setAttackerFlag}
          onTargetSelect={setTargetFlag}
          onExecute={handleExecuteAttack}
          onClose={() => {
            setShowAttackModal(false)
            setAttackerFlag(null)
            setTargetFlag(null)
            setShowVictory(false)
          }}
        />
      )}

      <VictorySplash
        show={showVictory}
        onClose={() => {
          setShowVictory(false)
          setShowAttackModal(false)
        }}
      />

    </div>
  )
}

// Attack Modal Component
function AttackModal({
  owned,
  attackerFlag,
  targetFlag,
  attackFeeInfo,
  attackPending,
  onAttackerSelect,
  onTargetSelect,
  onExecute,
  onClose
}: {
  owned: Array<{ id: number; name: string; balance18: bigint }>
  attackerFlag: Flag | null
  targetFlag: Flag | null
  attackFeeInfo: { baseFee: string; finalFee: string; isFreeAttack: boolean; freeAttacksRemaining: number } | null
  attackPending: boolean
  onAttackerSelect: (flag: Flag | null) => void
  onTargetSelect: (flag: Flag | null) => void
  onExecute: () => void
  onClose: () => void
}) {
  const canAttack = attackerFlag && targetFlag && attackerFlag.id !== targetFlag.id && 
                    owned.some(o => o.id === attackerFlag.id) && 
                    !attackPending
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-panel)',
        border: '2px solid var(--gold)',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 8px 32px rgba(255, 215, 0, 0.3)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold)' }}>
            ⚔️ Launch Free Attack
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
        
        {/* Attacker Flag Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            Your Flag (Attacker)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
            {ALL_FLAGS.filter(f => owned.some(o => o.id === f.id)).map(flag => (
              <button
                key={flag.id}
                onClick={() => onAttackerSelect(flag)}
                style={{
                  padding: '1rem',
                  background: attackerFlag?.id === flag.id ? 'rgba(255, 215, 0, 0.2)' : 'var(--bg-panel-soft)',
                  border: attackerFlag?.id === flag.id ? '2px solid var(--gold)' : '1px solid var(--stroke)',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                <img src={flag.flagImage} alt={flag.name} style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {flag.code}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {(() => {
                    const ownedFlag = owned.find(o => o.id === flag.id)
                    return ownedFlag ? `${formatEther(ownedFlag.balance18)} tokens` : 'Owned'
                  })()}
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Target Flag Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            Target Flag
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
            {ALL_FLAGS.filter(f => f.id !== attackerFlag?.id).map(flag => (
              <button
                key={flag.id}
                onClick={() => onTargetSelect(flag)}
                style={{
                  padding: '1rem',
                  background: targetFlag?.id === flag.id ? 'rgba(255, 140, 0, 0.2)' : 'var(--bg-panel-soft)',
                  border: targetFlag?.id === flag.id ? '2px solid var(--amber)' : '1px solid var(--stroke)',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center'
                }}
              >
                <img src={flag.flagImage} alt={flag.name} style={{ width: '48px', height: '36px', objectFit: 'cover', borderRadius: '4px', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {flag.code}
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Attack Fee Info */}
        {attackFeeInfo && (
          <div style={{
            background: attackFeeInfo.freeAttacksRemaining > 0
              ? 'rgba(255, 215, 0, 0.1)' 
              : 'var(--bg-panel-soft)',
            border: `1px solid ${attackFeeInfo.freeAttacksRemaining > 0 ? 'var(--gold)' : 'var(--stroke)'}`,
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Attack Fee:</span>
              <span style={{ 
                color: attackFeeInfo.freeAttacksRemaining > 0 ? 'var(--gold)' : 'var(--text-primary)', 
                fontWeight: '600',
                fontSize: '1rem'
              }}>
                {attackFeeInfo.freeAttacksRemaining > 0 
                  ? 'FREE (Using Free Attack)' 
                  : `$${(Number(attackFeeInfo.finalFee) / 1e6).toFixed(6)}`}
              </span>
            </div>
            {attackFeeInfo.freeAttacksRemaining === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No free attacks available. Regular fee will be charged.
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onClose}
            disabled={attackPending}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'var(--bg-panel-soft)',
              border: '1px solid var(--stroke)',
              borderRadius: '0.75rem',
              color: 'var(--text-primary)',
              fontWeight: '600',
              cursor: attackPending ? 'not-allowed' : 'pointer',
              opacity: attackPending ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={onExecute}
            disabled={!canAttack}
            style={{
              flex: 2,
              padding: '0.75rem',
              background: canAttack ? 'var(--gold)' : 'var(--stroke)',
              border: 'none',
              borderRadius: '0.75rem',
              color: canAttack ? 'var(--text-dark)' : 'var(--text-muted)',
              fontWeight: '700',
              cursor: canAttack ? 'pointer' : 'not-allowed',
              opacity: canAttack ? 1 : 0.5
            }}
          >
            {attackPending ? 'Attacking...' : '⚔️ Launch Attack'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RequirementItem({
  icon,
  text,
  met,
  completed,
  action,
  countdownSeconds,
  readyToConfirm,
  confirmLabel,
  onConfirm
}: {
  icon: string
  text: string
  met: boolean
  completed?: boolean
  action?: {
    label: string
    onClick: () => void
    disabled?: boolean
  }
  countdownSeconds?: number | null
  readyToConfirm?: boolean
  confirmLabel?: string
  onConfirm?: () => void
}) {
  const showAction = Boolean(action) && !met && !completed
  const showCountdown = typeof countdownSeconds === 'number' && countdownSeconds > 0
  // Confirm butonu: countdown bitti (readyToConfirm true) ve henüz met değil ve completed değil
  const showConfirm = Boolean(onConfirm) && Boolean(readyToConfirm) && !met && !completed
  const showDone = met
  
  // Debug log
  if (readyToConfirm && !met && !completed) {
    console.log(`[REQUIREMENT] ${text}: showConfirm=${showConfirm}, readyToConfirm=${readyToConfirm}, met=${met}, completed=${completed}, onConfirm=${Boolean(onConfirm)}`)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem',
        background: showDone ? 'rgba(255, 215, 0, 0.1)' : 'transparent',
        borderRadius: '0.5rem',
        transition: 'all 0.2s ease',
        border: showDone ? '1px solid rgba(255, 215, 0, 0.3)' : '1px solid transparent'
      }}
    >
      <div
        style={{
          fontSize: '1.5rem',
          filter: showDone ? 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.5))' : 'none',
          transition: 'all 0.2s ease'
        }}
      >
        {icon}
      </div>
      <div
        style={{
          color: showDone ? 'var(--gold)' : 'var(--text-secondary)',
          fontSize: '0.9375rem',
          fontWeight: showDone ? '600' : '400',
          textDecoration: completed && showDone ? 'line-through' : 'none',
          opacity: completed && showDone ? 0.7 : 1,
          flex: 1
        }}
      >
        {text}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {showAction && (
          <button
            onClick={() => {
              if (action?.disabled) return
              action?.onClick()
            }}
            disabled={action?.disabled}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '0.6rem',
              border: action?.disabled
                ? '1px solid rgba(248, 113, 113, 0.25)'
                : '1px solid rgba(248, 113, 113, 0.45)',
              background: action?.disabled
                ? 'rgba(248, 113, 113, 0.12)'
                : 'rgba(248, 113, 113, 0.18)',
              color: action?.disabled ? '#fca5a5' : '#f87171',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: action?.disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: action?.disabled ? 'none' : '0 0 0 rgba(248, 113, 113, 0)'
            }}
            onMouseEnter={(e) => {
              if (action?.disabled) return
              e.currentTarget.style.background = 'rgba(248, 113, 113, 0.28)'
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(248, 113, 113, 0.25)'
            }}
            onMouseLeave={(e) => {
              if (action?.disabled) return
              e.currentTarget.style.background = 'rgba(248, 113, 113, 0.18)'
              e.currentTarget.style.boxShadow = '0 0 0 rgba(248, 113, 113, 0)'
            }}
          >
            {action?.label}
          </button>
        )}

        {showCountdown && (
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#f97316',
              background: 'rgba(249, 115, 22, 0.12)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              borderRadius: '999px',
              padding: '0.25rem 0.65rem'
            }}
          >
            ⏳ {countdownSeconds}s
          </span>
        )}

        {showConfirm && (
          <button
            onClick={onConfirm}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '0.6rem',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.25)'
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(34, 197, 94, 0.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'
              e.currentTarget.style.boxShadow = '0 0 0 rgba(34, 197, 94, 0)'
            }}
          >
            {confirmLabel ?? 'Confirm step'}
          </button>
        )}

        {showDone && (
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--gold)',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            ✓ Done
          </div>
        )}
      </div>
    </div>
  )
}
