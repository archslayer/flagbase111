"use client"
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { writeContract, waitForTransactionReceipt, simulateContract, readContract } from 'wagmi/actions'
import { config } from '@/app/providers'
import { ConnectAndLogin } from '@/components/ConnectAndLogin'
import { useToast } from '@/components/Toast'

const ACHIEVEMENTS_SBT_ADDRESS = process.env.NEXT_PUBLIC_ACHIEVEMENTS_SBT_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const MINT_PRICE_USDC = '0.20' // Display price

// Achievement categories
const CATEGORIES = {
  1: { key: 'ATTACK_COUNT', title: 'Attack Count', icon: '⚔️' },
  2: { key: 'MULTI_COUNTRY', title: 'Multi-Country', icon: '🌍' },
  3: { key: 'REFERRAL_COUNT', title: 'Referral Count', icon: '👥' },
  5: { key: 'FLAG_COUNT', title: 'Flag Count', icon: '🏁' },
}

interface Achievement {
  category: number
  level: number
  title: string
  description: string
  imageURI: string
  status: 'locked' | 'earned' | 'owned'
  mintedAt?: Date
}

export default function AchievementsPage() {
  const { address, isConnected } = useAccount()
  const { push } = useToast()

  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(false)
  
  type MyAchievementsProgress = {
    totalAttacks: number
    distinctCountriesAttacked: number
    referralCount: number
    flagCount: number
  }
  const [progress, setProgress] = useState<MyAchievementsProgress | null>(null)
  const [mintingId, setMintingId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch user's achievements (optimized: show page immediately)
  useEffect(() => {
    if (!mounted || !address || !isConnected) {
      return
    }

    // Show page immediately, load data in background
    setLoading(false)
    
    ;(async () => {
      try {
        const res = await fetch('/api/achievements/my', {
          credentials: 'include',
          cache: 'force-cache', // Use cache for faster loading
        })

        if (!res.ok) {
          throw new Error('Failed to fetch achievements')
        }

        const data = await res.json()
        setProgress(data.progress)

        // Build achievement grid
        const grid: Achievement[] = []

        data.defs.forEach((def: any) => {
          def.levels.forEach((level: number) => {
            const earned = data.earned[def.category]?.includes(level) || false
            const minted = data.minted[def.category]?.includes(level) || false

            let status: 'locked' | 'earned' | 'owned' = 'locked'
            if (minted) status = 'owned'
            else if (earned) status = 'earned'

            grid.push({
              category: def.category,
              level,
              title: `${def.title} — ${level}`,
              description: `${def.description}: ${level}`,
              imageURI: `${def.imageBaseURI}/${level}.png`,
              status,
            })
          })
        })

        // Sort by category, then level
        grid.sort((a, b) => {
          if (a.category !== b.category) return a.category - b.category
          return a.level - b.level
        })

        setAchievements(grid)
      } catch (error: any) {
        console.error('Failed to load achievements:', error)
        push({ type: 'error', text: error?.message || 'Failed to load achievements' })
      } finally {
        setLoading(false)
      }
    })()
  }, [mounted, address, isConnected, push])

  const handleMint = async (achv: Achievement) => {
    if (!address || achv.status !== 'earned') return

    const mintId = `${achv.category}-${achv.level}`
    setMintingId(mintId)

    try {
      // 1. Get mint authorization
      push({ type: 'info', text: 'Requesting mint authorization...' })

      const authRes = await fetch('/api/achievements/mint-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category: achv.category,
          level: achv.level,
        }),
      })

      if (!authRes.ok) {
        const error = await authRes.json()
        throw new Error(error.error || 'Failed to get authorization')
      }

      const { auth, signature } = await authRes.json()

      // 2. Approve USDC (if needed)
      push({ type: 'info', text: 'Checking USDC allowance...' })

      // Check current allowance
      const currentAllowance = await readContract(config, {
        address: USDC_ADDRESS,
        abi: [{ type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'allowance',
        args: [address, ACHIEVEMENTS_SBT_ADDRESS],
      })

      if (currentAllowance < BigInt(auth.priceUSDC6)) {
        push({ type: 'info', text: 'Approving USDC...' })
        
        const approvalHash = await writeContract(config, {
          address: USDC_ADDRESS,
          abi: [{ type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' }],
          functionName: 'approve',
          args: [ACHIEVEMENTS_SBT_ADDRESS, BigInt(auth.priceUSDC6)],
        })

        push({ type: 'info', text: 'USDC approved. Waiting for confirmation...' })
        const approvalReceipt = await waitForTransactionReceipt(config, {
          hash: approvalHash,
          timeout: 60_000,
        })
        
        // Wait extra 2 seconds for state sync
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        console.log('Approval confirmed:', approvalReceipt)
      } else {
        console.log('Already approved:', currentAllowance.toString())
      }

      // 3. Simulate mint first
      push({ type: 'info', text: 'Simulating mint...' })
      
      try {
        await simulateContract(config, {
          address: ACHIEVEMENTS_SBT_ADDRESS,
          abi: [
            {
              inputs: [
                {
                  components: [
                    { name: 'user', type: 'address' },
                    { name: 'category', type: 'uint256' },
                    { name: 'level', type: 'uint256' },
                    { name: 'priceUSDC6', type: 'uint256' },
                    { name: 'nonce', type: 'uint256' },
                    { name: 'deadline', type: 'uint256' },
                  ],
                  name: 'auth',
                  type: 'tuple',
                },
                { name: 'signature', type: 'bytes' },
              ],
              name: 'mint',
              outputs: [],
              stateMutability: 'nonpayable',
              type: 'function',
            },
          ],
          functionName: 'mint',
          args: [
            {
              user: auth.user as `0x${string}`,
              category: BigInt(auth.category),
              level: BigInt(auth.level),
              priceUSDC6: BigInt(auth.priceUSDC6),
              nonce: BigInt(auth.nonce),
              deadline: BigInt(auth.deadline),
            },
            signature as `0x${string}`,
          ],
          account: address,
        })
        push({ type: 'success', text: '✓ Simulation successful' })
      } catch (simError: any) {
        console.error('Simulation error:', simError)
        throw new Error(`Simulation failed: ${simError?.shortMessage || simError?.message}`)
      }

      // 4. Mint SBT
      push({ type: 'info', text: 'Minting achievement...' })

      const mintHash = await writeContract(config, {
        address: ACHIEVEMENTS_SBT_ADDRESS,
        abi: [
          {
            inputs: [
              {
                components: [
                  { name: 'user', type: 'address' },
                  { name: 'category', type: 'uint256' },
                  { name: 'level', type: 'uint256' },
                  { name: 'priceUSDC6', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
                name: 'auth',
                type: 'tuple',
              },
              { name: 'signature', type: 'bytes' },
            ],
            name: 'mint',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'mint',
        args: [
          {
            user: auth.user as `0x${string}`,
            category: BigInt(auth.category),
            level: BigInt(auth.level),
            priceUSDC6: BigInt(auth.priceUSDC6),
            nonce: BigInt(auth.nonce),
            deadline: BigInt(auth.deadline),
          },
          signature as `0x${string}`,
        ],
      })

      push({ type: 'info', text: 'Transaction sent. Waiting for confirmation...' })

      const receipt = await waitForTransactionReceipt(config, {
        hash: mintHash,
        timeout: 120_000,
      })

      if (receipt.status === 'success') {
        // 4. Confirm on backend
        await fetch('/api/achievements/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            txHash: mintHash,
            category: achv.category,
            level: achv.level,
          }),
        })

        push({ type: 'success', text: '🎉 Achievement minted!' })

        // Update UI
        setAchievements((prev) =>
          prev.map((a) =>
            a.category === achv.category && a.level === achv.level
              ? { ...a, status: 'owned' as const, mintedAt: new Date() }
              : a
          )
        )
      } else {
        push({ type: 'error', text: 'Mint transaction failed' })
      }
    } catch (error: any) {
      console.error('Mint error:', error)
      if (error?.message?.includes('User rejected') || error?.message?.includes('User denied')) {
        push({ type: 'info', text: 'Transaction cancelled' })
      } else {
        push({ type: 'error', text: error?.shortMessage || error?.message || 'Mint failed' })
      }
    } finally {
      setMintingId(null)
    }
  }

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return null
  }

  if (!isConnected) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-page)',
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
          <h1 style={{ marginBottom: '1rem' }}>🏆 Achievements</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Connect your wallet to view your achievements
          </p>
          <ConnectAndLogin />
        </div>
      </div>
    )
  }

  // No loading spinner - show page immediately with data loading in background

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          🏆 Achievements
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Earn achievements by playing FlagWars. Mint them as Soulbound NFTs for {MINT_PRICE_USDC}{' '}
          USDC each.
        </p>
      </div>

      {/* Progress Stats */}
      {progress && progress.totalAttacks !== undefined && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <StatCard label="Total Attacks" value={progress.totalAttacks} icon="⚔️" />
          <StatCard
            label="Countries Attacked"
            value={progress.distinctCountriesAttacked}
            icon="🌍"
          />
          <StatCard label="Referrals" value={progress.referralCount} icon="👥" />
          <StatCard label="Flags Owned" value={progress.flagCount ?? 0} icon="🏁" />
        </div>
      )}

      {/* Achievement Grid (4x4) */}
      {achievements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          ⏳ Loading achievements...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            maxWidth: '900px',
            margin: '0 auto',
          }}
          className="achievement-grid"
        >
          {achievements.map((achv) => {
            const mintId = `${achv.category}-${achv.level}`
            const isMinting = mintingId === mintId

  return (
              <AchievementCard
                key={mintId}
                achievement={achv}
                onMint={() => handleMint(achv)}
                isMinting={isMinting}
              />
            )
          })}
        </div>
      )}
          </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--stroke)',
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '2rem' }}>{icon}</div>
              <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
          {value}
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            </div>
  )
}

function AchievementCard({
  achievement,
  onMint,
  isMinting,
}: {
  achievement: Achievement
  onMint: () => void
  isMinting: boolean
}) {
  const { status, title, description, imageURI } = achievement

  const borderColor =
    status === 'owned' ? 'var(--gold)' : status === 'earned' ? 'var(--accent)' : 'var(--stroke)'

  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: `2px solid ${borderColor}`,
        borderRadius: '0.75rem',
        padding: '1rem',
        textAlign: 'center',
        opacity: status === 'locked' ? 0.5 : 1,
        transition: 'all 0.2s',
        position: 'relative',
      }}
    >
      {/* Image/Icon */}
      <div
        style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 0.75rem',
          borderRadius: '0.5rem',
          background: 'var(--bg-panel-soft)',
              display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          filter: status === 'locked' ? 'grayscale(100%)' : 'none',
        }}
      >
        {status === 'locked' ? '🔒' : CATEGORIES[achievement.category as keyof typeof CATEGORIES]?.icon || '🏆'}
      </div>

      {/* Title */}
      <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>
        {title}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginBottom: '0.75rem',
          minHeight: '2.5rem',
        }}
      >
        {description}
      </div>

      {/* Status/Action */}
      {status === 'locked' && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not Earned Yet</div>
      )}

      {status === 'earned' && (
        <button
          className="btn btn-primary"
          onClick={onMint}
          disabled={isMinting}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.75rem',
          }}
        >
          {isMinting ? '⏳ Minting...' : `Mint (${MINT_PRICE_USDC} USDC)`}
                </button>
              )}

      {status === 'owned' && (
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: 'var(--gold)',
            background: 'rgba(255, 215, 0, 0.1)',
            padding: '0.5rem',
            borderRadius: '0.375rem',
          }}
        >
          ✓ Owned
            </div>
      )}
          </div>
  )
}
