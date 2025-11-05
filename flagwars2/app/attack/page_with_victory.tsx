"use client"
import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { writeContract, waitForTransactionReceipt } from "wagmi/actions"
import { config } from "@/app/providers"
import { ConnectAndLogin } from "@/components/ConnectAndLogin"
import { useOwnedFlagsOptimized } from "@/lib/useOwnedFlagsOptimized"
import { useToast } from "@/components/Toast"
import { VictorySplash } from "@/components/VictorySplash"
import { computeAttackTier, type AttackConfig } from "@/lib/attackTierCalc"
import { isOnExpectedChain, ensureCorrectChain } from "@/lib/chain"
import { CORE_ABI } from "@/lib/core-abi"
import { formatEther } from "viem"

const CORE_ADDRESS = process.env.NEXT_PUBLIC_CORE_ADDRESS as `0x${string}`

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
  const { push } = useToast()
  
  const [isLoggedIn, setIsLoggedIn] = useState(false)
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
  const { owned, loading } = useOwnedFlagsOptimized(ALL_FLAGS, address as `0x${string}`, isLoggedIn)
  
  // Compute tier client-side (no extra RPC)
  const tierData = attackerFlag && attackConfig
    ? computeAttackTier(
        owned.find(o => o.id === attackerFlag.id)?.price8 || 0n,
        attackConfig
      )
    : null
  
  const delta = tierData?.delta8
  const fee = tierData?.fee
  const tier = tierData?.tier
  const attackFeeInUSDC = tierData?.isUSDC

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

  // Fetch attack config once (cached for 5min)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/config/attack')
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

  // Check login status
  useEffect(() => {
    (async () => {
      if (!address || !isConnected) {
        setIsLoggedIn(false)
        return
      }
      try {
        const res = await fetch('/api/me', { credentials: 'include', cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setIsLoggedIn(data?.ok === true)
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

    // Check correct chain
    if (!isOnExpectedChain()) {
      try {
        await ensureCorrectChain()
      } catch {
        push({ type: 'error', text: 'Please switch to Base Sepolia' })
        return
      }
    }

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
      const amountToken18 = BigInt(1) * BigInt(1e18) // Always 1 token per attack

      let txHash: `0x${string}`

      if (multiplier === 5) {
        // Use batch attack for 5x
        const items = Array(5).fill(null).map(() => ({
          fromId: BigInt(attackerFlag.id),
          toId: BigInt(targetFlag.id),
          amountToken18: amountToken18
        }))

        txHash = await writeContract(config, {
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'attackBatch',
          args: [items],
          chainId: 84532
        })

        push({ 
          type: 'info', 
          text: `5x Attack sent! Waiting for confirmation...`,
          ttl: 3000 
        })
      } else {
        // Single attack
        txHash = await writeContract(config, {
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'attack',
          args: [BigInt(attackerFlag.id), BigInt(targetFlag.id), amountToken18],
          chainId: 84532
        })

        push({ 
          type: 'info', 
          text: `Attack sent! Waiting for confirmation...`,
          ttl: 3000 
        })
      }

      // Wait for transaction confirmation
      const receipt = await waitForTransactionReceipt(config, {
        hash: txHash,
        timeout: 60_000,
        pollingInterval: 1000
      })

      if (receipt.status === 'success') {
        // Show VICTORY splash!
        setShowVictory(true)
        
        push({ 
          type: 'success', 
          text: `⚔️ Attack successful!`,
          ttl: 5000 
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
      if (error?.message?.includes('user rejected')) {
        push({ type: 'info', text: 'Attack cancelled' })
      } else if (error?.message?.includes('ErrInsufficientBalance')) {
        push({ type: 'error', text: 'Insufficient token balance' })
      } else if (error?.message?.includes('ErrBatchTooLarge')) {
        push({ type: 'error', text: 'Cannot execute 5x attack at this time' })
      } else {
        push({ type: 'error', text: error?.shortMessage || 'Attack failed' })
      }
    } finally {
      setTxPending(false)
    }
  }


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
      // Selecting target
      setTargetFlag(flag)
      setShowTargets(null)
    }
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
              {(showTargets ? ALL_FLAGS : ALL_FLAGS.filter(f => owned.some(o => o.id === f.id))).map(flag => (
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
                Attack Details {tier && <span style={{ color: 'var(--gold)', fontWeight: '600' }}>• Tier {tier}</span>}
                {' • '}
                Attack Fee: {fee ? (
                  <>
                    {attackFeeInUSDC 
                      ? `${((Number(fee) * multiplier) / 1e6).toFixed(2)} USDC` 
                      : `${(parseFloat(formatEther(fee)) * multiplier).toFixed(4)} TOKEN`
                    }
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
