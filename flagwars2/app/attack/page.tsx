"use client"
import { useState, useEffect } from "react"
import { useAccount, useChainId } from "wagmi"
import { config } from "@/app/providers"
import { ConnectAndLogin } from "@/components/ConnectAndLogin"
import { useOwnedFlags } from "@/lib/useOwnedFlags"
import { useToast } from "@/components/Toast"
import { VictorySplash } from "@/components/VictorySplash"
import { computeAttackTier, type AttackConfig } from "@/lib/attackTierCalc"
import { estimateAttackFee } from "@/lib/attack-flow"
import { guardedWrite, guardedWaitSafe, guardedRead } from "@/lib/guarded-tx"
import { requireBaseSepolia } from "@/lib/chain-guard"
import { BASE_SEPOLIA_ID } from "@/lib/chains"
import { CORE_ABI } from "@/lib/core-abi"
import { formatEther, erc20Abi } from "viem"

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

// USDC Allowance helper for attack fees
async function ensureUsdcAllowance(minNeeded: bigint, owner: `0x${string}`, pushToast: any) {
  try {
    const current = await guardedRead({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, CORE_ADDRESS]
    }) as bigint

    if (current >= minNeeded) {
      console.log('[USDC] Allowance OK:', current.toString())
      return
    }

    pushToast({ type: 'info', text: 'Approving USDC for attack fees...', ttl: 3000 })

    // Max uint256 for one-time approval
    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')

    const approveTx = await guardedWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CORE_ADDRESS, maxAmount]
    })

    console.log('[USDC] Approve tx:', approveTx)
    
    await guardedWaitSafe({ hash: approveTx, timeout: 60_000, pollingInterval: 1000 })

    pushToast({ type: 'success', text: 'USDC approved for attacks!', ttl: 3000 })
  } catch (error: any) {
    console.error('[USDC] Allowance error:', error)
    throw new Error('USDC approval failed: ' + (error?.shortMessage || error?.message))
  }
}

// Active countries in contract
const ALL_FLAGS = [
  { id: 90, name: "Turkey", flagImage: "/flags/TR.png", code: "TR" },
  { id: 44, name: "United Kingdom", flagImage: "/flags/UK.png", code: "GB" },
  { id: 1, name: "United States", flagImage: "/flags/USA.png", code: "US" },
]

interface Flag {
  id: number
  name: string
  flagImage: string
  code: string
}

export default function AttackPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { push } = useToast()
  
  // Network guard
  const onWrongChain = chainId && chainId !== BASE_SEPOLIA_ID
  
  // Use null for initial state to distinguish "checking" from "not logged in"
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [attackerFlag, setAttackerFlag] = useState<Flag | null>(null)
  const [targetFlag, setTargetFlag] = useState<Flag | null>(null)
  const [txPending, setTxPending] = useState(false)
  const [showTargets, setShowTargets] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [attackConfig, setAttackConfig] = useState<AttackConfig | null>(null)
  
  // Attack multiplier (1x or 5x)
  const [multiplier, setMultiplier] = useState<1 | 5>(1)
  
  // Victory splash
  const [showVictory, setShowVictory] = useState(false)

  // Fetch user's owned flags (optimized multicall)
  // Only fetch when logged in (isLoggedIn === true, not null)
  const { owned, loading } = useOwnedFlags(ALL_FLAGS, address as `0x${string}`, isConnected)
  
  // Debug: Log hook state (disabled - causes spam)
  // useEffect(() => {
  //   if (process.env.NODE_ENV !== 'production') {
  //     console.log('[ATTACK] Hook state:', { address, isConnected, owned: owned.length, loading })
  //   }
  // }, [address])
  
  // Attack fee state
  const [attackFeeInfo, setAttackFeeInfo] = useState<{
    baseFee: string;
    finalFee: string;
    wb1Multiplier: string;
    wb2Multiplier: string;
    isFreeAttack: boolean;
    freeAttacksUsed: number;
    freeAttacksRemaining: number;
  } | null>(null)

  // Compute attack fee with WB multipliers
  useEffect(() => {
    if (!attackerFlag || !targetFlag || !address) {
      setAttackFeeInfo(null)
      return
    }

    const calculateFee = async () => {
      try {
        const feeInfo = await estimateAttackFee(attackerFlag.id, targetFlag.id, address)
        setAttackFeeInfo(feeInfo)
      } catch (error) {
        console.error('[ATTACK] Error calculating attack fee:', error)
        setAttackFeeInfo(null)
      }
    }

    calculateFee()
  }, [attackerFlag, targetFlag, address])

  const delta = attackFeeInfo ? BigInt(attackFeeInfo.baseFee) : 0n
  const fee = attackFeeInfo ? BigInt(attackFeeInfo.finalFee) : 0n
  
  // WB tier: Only show if multiplier is actually applied (> 10000 means bonus applied)
  // wb1Multiplier/wb2Multiplier format: "10000" = 100% (no bonus), "11000" = 110% (10% bonus)
  const hasWB1 = attackFeeInfo && parseInt(attackFeeInfo.wb1Multiplier) > 10000
  const hasWB2 = attackFeeInfo && parseInt(attackFeeInfo.wb2Multiplier) > 10000
  const tier = hasWB1 ? 1 : (hasWB2 ? 2 : 0)
  
  const attackFeeInUSDC = true // Always USDC for war balance

  // Check screen size
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < 768)
    }
  }, [])

  // Auto-select first owned flag
  useEffect(() => {
    if (owned.length > 0 && !attackerFlag) {
      const ownedFlag = ALL_FLAGS.find(f => f.id === owned[0].id)
      if (ownedFlag) setAttackerFlag(ownedFlag)
    }
  }, [owned, attackerFlag])

  // Fetch attack config once (cached for 5min, non-blocking)
  useEffect(() => {
    // Don't block page rendering
    ;(async () => {
      try {
        const res = await fetch('/api/config/attack', { cache: 'force-cache' })
        if (res.ok) {
          const data = await res.json()
          if (data?.ok && data.config) {
            setAttackConfig({
              attackFeeInUSDC: data.config.attackFeeInUSDC,
              tier1Price8: BigInt(data.config.tier1Price8),
              tier2Price8: BigInt(data.config.tier2Price8),
              tier3Price8: BigInt(data.config.tier3Price8),
              delta1_8: BigInt(data.config.delta1_8),
              delta2_8: BigInt(data.config.delta2_8),
              delta3_8: BigInt(data.config.delta3_8),
              delta4_8: BigInt(data.config.delta4_8),
              fee1_USDC6: data.config.fee1_USDC6,
              fee2_USDC6: data.config.fee2_USDC6,
              fee3_USDC6: data.config.fee3_USDC6,
              fee4_USDC6: data.config.fee4_USDC6,
              fee1_TOKEN18: BigInt(data.config.fee1_TOKEN18),
              fee2_TOKEN18: BigInt(data.config.fee2_TOKEN18),
              fee3_TOKEN18: BigInt(data.config.fee3_TOKEN18),
              fee4_TOKEN18: BigInt(data.config.fee4_TOKEN18)
            })
          }
        }
      } catch (e) {
        console.error('Failed to fetch attack config:', e)
      }
    })()
  }, [])

  // Check login status (optimized: check immediately, no blocking)
  useEffect(() => {
    if (!address || !isConnected) {
      setIsLoggedIn(false)
      return
    }
    
    // Optimistically set to true (will correct if wrong)
    setIsLoggedIn(true)
    
    // Verify in background (non-blocking)
    ;(async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setIsLoggedIn(data?.ok === true)
        } else {
          setIsLoggedIn(false)
        }
      } catch {
        setIsLoggedIn(false)
      }
    })()
  }, [address, isConnected])

  const canAttack = 
    !!address && 
    !!attackerFlag &&
    !!targetFlag && 
    attackerFlag.id !== targetFlag.id && 
    owned.some(o => o.id === attackerFlag.id)

  const handleAttack = async () => {
    if (!canAttack) {
      push({ type: 'error', text: 'Invalid attack parameters' })
      return
    }

    // Hard guard: prevent self-attack
    if (attackerFlag.id === targetFlag.id) {
      push({ type: 'error', text: 'You cannot attack the same flag' })
      return
    }

    // Chain guard artık guardedWrite içinde otomatik yapılıyor

    // Extra UI guard
    const myFlag = owned.find(o => o.id === attackerFlag.id)
    if (!myFlag) {
      push({ type: 'error', text: 'Selected attacker flag is not in your balance' })
      return
    }

    if (!fee) {
      push({ type: 'error', text: 'Attack fee not loaded yet' })
      return
    }

    setTxPending(true)

    try {
      // Ensure USDC allowance for attack fee (multiplier applies)
      const totalFee = fee * BigInt(multiplier)
      await ensureUsdcAllowance(totalFee, address!, push)

      const amountToken18 = BigInt(1) * BigInt(1e18) // Always 1 token per attack

      // Single attack or batch attack - USDC fee handled by contract
      let txHash: `0x${string}`

      if (multiplier === 5) {
        // Use batch attack for 5x
        const items = Array(5).fill(null).map(() => ({
          fromId: BigInt(attackerFlag.id),
          toId: BigInt(targetFlag.id),
          amountToken18: amountToken18
        }))

        // Validate all batch items
        for (const item of items) {
          if (item.fromId === item.toId) {
            push({ type: 'error', text: 'Batch attack contains self-attack - blocked' })
            return
          }
        }

        txHash = await guardedWrite({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'attackBatch',
          args: [items]
        })

        console.log('[ATTACK] 5x Batch txHash:', txHash)
        push({ 
          type: 'info', 
          text: `5x Attack sent! Waiting for confirmation...`,
          ttl: 3000 
        })
      } else {
        // Single attack
        txHash = await guardedWrite({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'attack',
          args: [BigInt(attackerFlag.id), BigInt(targetFlag.id), amountToken18]
        })

        console.log('[ATTACK] Single txHash:', txHash)
        push({ 
          type: 'info', 
          text: `Attack sent! Waiting for confirmation...`,
          ttl: 3000 
        })
      }

      // Wait for transaction confirmation with safe retry mechanism
      const receipt = await guardedWaitSafe({
        hash: txHash,
        timeout: 60_000,
        pollingInterval: 1000
      })

      console.log('[ATTACK] Receipt confirmed:', receipt.status, 'blockNumber:', receipt.blockNumber)
      
      // Add delay before any contract reads to let RPC sync
      await new Promise(r => setTimeout(r, 1500))

      if (receipt.status === 'success') {
        // Show VICTORY splash!
        setShowVictory(true)
        
        push({ 
          type: 'success',
          text: `⚔️ Attack successful!`,
          ttl: 5000 
        })

        // Achievement tracking (direct API call for immediate sync)
        fetch('/api/achievements/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'attack',
            targetCountryId: targetFlag.id,
          })
        }).catch(() => {})
        
        // Queue event via API for cache invalidation and DB audit
        fetch('/api/queue/attack-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: address,
            fromId: attackerFlag.id,
            toId: targetFlag.id,
            amountToken18: amountToken18.toString(),
            txHash,
            blockNumber: receipt.blockNumber?.toString() ?? '0',
            feeUSDC6: fee ? (fee * BigInt(multiplier)).toString() : '0',
            timestamp: Date.now()
          })
        }).catch(() => {}) // Ignore queue errors
        
        // ACTIVITY FEED: Push attack event to Redis for recent activity display
        // This will be picked up by the Market page's RecentAttacks component
        fetch('/api/activity/push-attack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attackId: `${txHash}:0`, // txHash:logIndex (using 0 for simplicity)
            ts: Math.floor(Date.now() / 1000),
            blockNumber: Number(receipt.blockNumber || 0),
            logIndex: 0, // Could parse from receipt.logs if needed
            attacker: address!.toLowerCase(),
            attackerCountry: attackerFlag.code,
            defenderCode: targetFlag.code,
            delta: attackConfig?.deltaPoints?.toFixed(2) || '0', // Safe access
            feeUSDC6: (fee * BigInt(multiplier)).toString(),
            txHash
          })
        }).catch((err) => {
          // Non-critical, but log for debugging
          console.warn('[ACTIVITY FEED] Failed to push attack event:', err)
        })
      } else {
        push({ 
          type: 'error', 
          text: 'Attack failed on-chain',
          ttl: 5000 
        })
      }

      // Reset
      setTargetFlag(null)
      setMultiplier(1)

    } catch (error: any) {
      console.error('[ATTACK] Full error:', error)
      console.error('[ATTACK] Error message:', error?.message)
      console.error('[ATTACK] Error shortMessage:', error?.shortMessage)
      console.error('[ATTACK] Error details:', error?.details)
      
      if (error?.message?.includes('user rejected')) {
        push({ type: 'info', text: 'Attack cancelled' })
      } else if (error?.message?.includes('ErrInsufficientBalance')) {
        push({ type: 'error', text: 'Insufficient token balance' })
      } else if (error?.message?.includes('ErrBatchTooLarge')) {
        push({ type: 'error', text: 'Cannot execute 5x attack at this time' })
      } else {
        push({ type: 'error', text: error?.shortMessage || error?.message || 'Attack failed' })
      }
    } finally {
      setTxPending(false)
    }
  }


  // Auto-clear target when it collides with attacker
  useEffect(() => {
    if (attackerFlag && targetFlag && attackerFlag.id === targetFlag.id) {
      setTargetFlag(null)
      push({ type: 'info', text: 'Target cleared - cannot attack same flag' })
    }
  }, [attackerFlag, targetFlag, push])

  // Flag selection handler
  const handleFlagSelection = (flag: Flag) => {
    if (showTargets === false) {
      // Selecting attacker - must be owned
      if (owned.some(o => o.id === flag.id)) {
        setAttackerFlag(flag)
        setShowTargets(null)
      } else {
        push({ type: 'error', text: 'You don\'t own this flag' })
      }
    } else {
      // Selecting target - cannot be same as attacker
      if (attackerFlag && flag.id === attackerFlag.id) {
        push({ type: 'error', text: 'Cannot attack the same flag' })
        return
      }
      setTargetFlag(flag)
      setShowTargets(null)
    }
  }

  // Show nothing while checking auth (prevents flicker)
  if (isLoggedIn === null) {
    return null
  }

  if (!isConnected || !isLoggedIn) {
  return (
      <div style={{
        position: 'relative',
        minHeight: '100vh',
        backgroundImage: 'url(/attackbg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          padding: '2rem',
          borderRadius: '1rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h1 style={{color: 'white', marginBottom: '1rem'}}>⚔️ Attack</h1>
          <p style={{color: 'rgba(255, 255, 255, 0.8)', marginBottom: '1.5rem'}}>
            Connect and login to launch attacks
          </p>
          <ConnectAndLogin />
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Victory Splash */}
      <VictorySplash show={showVictory} onClose={() => setShowVictory(false)} />

      <div style={{
        position: 'relative',
        minHeight: '100vh',
        backgroundImage: 'url(/attackbg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: typeof window !== 'undefined' && window.innerWidth < 768 ? 'center' : 'calc(50% + 128px) center',
        backgroundAttachment: 'fixed'
      }}>
        {/* Content */}
        <div style={{
        position: 'relative', 
        zIndex: 2, 
        padding: isMobile ? '1rem' : '2rem',
        maxWidth: '100%'
      }}>
        <h1 style={{color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>⚔️ Attack</h1>
        <p style={{marginBottom: '2rem', color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.8)'}}>
          Launch strategic attacks on other countries
        </p>

        {/* No owned flags warning */}
        {!loading && owned.length === 0 && (
          <div style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '0.5rem',
            marginBottom: '2rem',
            color: 'white',
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
          }}>
            <strong>❌ No tokens owned</strong>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
              You need to own tokens from at least one country to attack. 
              Visit the <a href="/market" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Market</a> to buy tokens.
            </p>
        </div>
      )}

      {/* Flag Selection - VS Layout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '1rem' : '2rem',
          padding: isMobile ? '1rem' : '2rem',
          marginBottom: '2rem',
          flexWrap: isMobile ? 'wrap' : 'nowrap'
        }}>
          {/* Attacker Flag */}
          <div style={{textAlign: 'center'}}>
            <div style={{
              width: isMobile ? '180px' : '228px',
              height: isMobile ? '120px' : '152px',
              border: '2px dashed var(--stroke)',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: owned.length > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              background: attackerFlag ? 'var(--bg-panel-soft)' : 'rgba(0, 0, 0, 0.5)',
              borderColor: attackerFlag ? 'var(--gold)' : 'var(--stroke)',
              opacity: owned.length > 0 ? 1 : 0.5
            }}
            onClick={() => owned.length > 0 && setShowTargets(false)}
            >
              {attackerFlag ? (
                <>
                  <img 
                    src={attackerFlag.flagImage} 
                    alt={attackerFlag.name}
                    style={{
                      width: isMobile ? '72px' : '91px',
                      height: isMobile ? '54px' : '68px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid var(--stroke)',
                      marginBottom: '0.25rem'
                    }}
                  />
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)'
                  }}>
                    {attackerFlag.code}
                  </div>
                </>
              ) : (
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: 'white',
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  lineHeight: '1.2'
                }}>
                  {owned.length > 0 ? (<>Click to select<br/>your flag</>) : (<>No flags<br/>owned</>)}
                </div>
              )}
            </div>
          </div>

          {/* VS Text */}
          <div style={{
            fontSize: isMobile ? '1.5rem' : '2rem',
            fontWeight: 'bold',
            color: 'var(--gold)',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
          }}>
            VS
          </div>

          {/* Target Flag */}
          <div style={{textAlign: 'center'}}>
            <div style={{
              width: isMobile ? '180px' : '228px',
              height: isMobile ? '120px' : '152px',
              border: '2px dashed var(--stroke)',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: targetFlag ? 'var(--bg-panel-soft)' : 'rgba(0, 0, 0, 0.5)',
              borderColor: targetFlag ? 'var(--gold)' : 'var(--stroke)'
            }}
            onClick={() => setShowTargets(true)}
            >
              {targetFlag ? (
                <>
                  <img 
                    src={targetFlag.flagImage} 
                    alt={targetFlag.name}
                    style={{
                      width: isMobile ? '72px' : '91px',
                      height: isMobile ? '54px' : '68px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid var(--stroke)',
                      marginBottom: '0.25rem'
                    }}
                  />
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--text-primary)'
                  }}>
                    {targetFlag.code}
                  </div>
                </>
              ) : (
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  color: 'white',
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  lineHeight: '1.2'
                }}>
                  Click to select<br/>target flag
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Flag Selection Grid */}
        {showTargets !== null && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '2rem'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h3 style={{margin: 0, fontSize: '1rem', color: 'white'}}>
                {showTargets ? 'Select Target Flag' : 'Select Your Flag (Owned Only)'}
              </h3>
              <button
                className="btn btn-secondary"
                onClick={() => setShowTargets(null)}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(80px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {(showTargets === false 
                ? owned.map(o => ALL_FLAGS.find(f => f.id === o.id)!).filter(Boolean)
                : ALL_FLAGS.filter(flag => !attackerFlag || flag.id !== attackerFlag.id) // Exclude attacker from targets
              ).map(flag => (
                <button
                  key={flag.id}
                  onClick={() => handleFlagSelection(flag)}
                  disabled={showTargets === false && !owned.some(o => o.id === flag.id)}
                  style={{
                    padding: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    opacity: (showTargets === false && !owned.some(o => o.id === flag.id)) ? 0.3 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (showTargets === true || owned.some(o => o.id === flag.id)) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'
                      e.currentTarget.style.borderColor = 'var(--gold)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                >
                  <img 
                    src={flag.flagImage} 
                    alt={flag.name}
                    style={{
                      width: '100%',
                      height: 'auto',
                      aspectRatio: '4/3',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      marginBottom: '0.25rem'
                    }}
                  />
                  <div style={{
                    fontSize: '0.625rem',
                    fontWeight: '600',
                    color: 'white',
                    textAlign: 'center'
                  }}>
                    {flag.code}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attack Panel */}
        <div style={{
          padding: '1.5rem',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <div style={{
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1.5rem'
          }}>
            {!attackerFlag || !attackConfig ? (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center' }}>
                {!attackConfig ? 'Loading config...' : 'Select your flag to see fee...'}
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center' }}>
                Attack Details {tier > 0 && <span style={{ color: 'var(--gold)', fontWeight: '600' }}>• Tier {tier}</span>}
                {' • '}
                Attack Fee: {attackFeeInfo ? (
                  <>
                    {attackFeeInfo.isFreeAttack ? (
                      <span style={{ color: 'var(--gold)', fontWeight: '600' }}>FREE</span>
                    ) : (
                      <>
                        {`${(parseFloat(attackFeeInfo.finalFee) / 1e6).toFixed(2)} USDC`}
                        {tier > 0 && (
                          <span style={{ color: 'var(--gold)', fontSize: '0.7rem' }}>
                            {' '}(WB{tier} applied)
                          </span>
                        )}
                      </>
                    )}
                    {multiplier === 5 && (
                      <span style={{ color: 'var(--gold)', fontWeight: '600' }}>
                        {' '}(5x attack)
                      </span>
                    )}
                  </>
                ) : '...'}
              </div>
            )}
          </div>

          {/* Attack Multiplier Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setMultiplier(1)}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: multiplier === 1 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                border: multiplier === 1 ? '2px solid var(--gold)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                transition: 'all 0.2s'
              }}
            >
              x1
            </button>
          <button
              onClick={() => setMultiplier(5)}
            style={{
                flex: 1,
                padding: '0.5rem',
                background: multiplier === 5 ? 'linear-gradient(135deg, #ff4d4d 0%, #c62828 100%)' : 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                border: multiplier === 5 ? '2px solid var(--gold)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                transition: 'all 0.2s'
              }}
            >
              x5
          </button>
          </div>
          
          {/* Launch Attack Button */}
          <button
            className="btn btn-primary"
            onClick={handleAttack}
            disabled={!canAttack || txPending || loading}
            style={{
              width: '100%',
              opacity: (!canAttack || txPending || loading) ? 0.5 : 1,
              background: multiplier === 5 
                ? 'linear-gradient(135deg, #ff4d4d 0%, #c62828 100%)' 
                : undefined
            }}
          >
            {txPending ? 'Attacking...' : `⚔️ Launch ${multiplier === 5 ? '5x ' : ''}Attack`}
          </button>
        </div>
        </div>
      </div>
    </>
  )
}
