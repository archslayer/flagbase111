"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useAccount, useReadContract, useChainId } from "wagmi";
import { decodeErrorResult, maxUint256, erc20Abi, createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

import ConfirmTradeModal from "@/components/ConfirmTradeModal";
import { TradeSuccessModal } from "@/components/TradeSuccessModal";

import { CORE_ADDRESS, USDC_ADDRESS, EXPECTED_CORE } from "@/lib/addresses";
import { CORE_ABI } from "@/lib/core-abi";
import { usePrice } from "@/lib/usePrice";
import { BASE_SEPOLIA_ID } from "@/lib/chains";
import { useToast } from '@/components/Toast'
import { attackIcon } from '@/lib/ui/flags'

type RecentBattleItem = {
  attackId: string
  ts: number
  attacker: string
  attackerCountry: string
  defenderCode: string
  feeUSDC6: string
  txHash: string
}

const RECENT_BATTLES_POLL_MS = 2000
const RECENT_BATTLES_TIMEOUT_MS = 800

function getFlagImage(countryCode: string): string {
  const c = (countryCode || '').toUpperCase()
  const fileMap: Record<string, string> = {
    US: 'USA',
    GB: 'UK',
    ES: 'SP',
    PT: 'POR',
    SE: 'SW',
    UA: 'UKR',
    ID: 'IND',
    AE: 'UAE',
    AR: 'ARG',
    MA: 'MO'
  }
  const fileName = fileMap[c] || c
  return `/flags/${fileName}.png`
}

function RecentBattles() {
  const [items, setItems] = useState<RecentBattleItem[]>([])
  const [etag, setEtag] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null

    const fetchBattles = async () => {
      try {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        const controller = new AbortController()
        abortControllerRef.current = controller

        const timeoutId = setTimeout(() => {
          controller.abort()
        }, RECENT_BATTLES_TIMEOUT_MS)

        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        }

        if (etag) {
          headers['If-None-Match'] = etag
        }

        const response = await fetch('/api/activity/attacks', {
          headers,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (response.status === 304 || response.status === 204) {
          setError(null)
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json().catch(() => null)

        if (data?.ok && Array.isArray(data.items)) {
          const normalized: RecentBattleItem[] = []

          for (const raw of data.items as any[]) {
            if (!raw) continue
            const attackId = typeof raw.attackId === 'string' ? raw.attackId : ''
            if (!attackId) continue

            const tsValue = typeof raw.ts === 'number' ? raw.ts : Number(raw.ts ?? 0)
            const attacker = typeof raw.attacker === 'string' ? raw.attacker : ''
            const attackerCountry = typeof raw.attackerCountry === 'string' ? raw.attackerCountry : ''
            const defenderCode = typeof raw.defenderCode === 'string' ? raw.defenderCode : ''
            const feeUSDC6 =
              typeof raw.feeUSDC6 === 'string'
                ? raw.feeUSDC6
                : String(raw.feeUSDC6 ?? '0')
            const txHash = typeof raw.txHash === 'string' ? raw.txHash : ''

            if (!attacker || !txHash) continue

            normalized.push({
              attackId,
              ts: Number.isFinite(tsValue) ? tsValue : 0,
              attacker,
              attackerCountry,
              defenderCode,
              feeUSDC6,
              txHash
            })
          }

          const deduped: RecentBattleItem[] = []
          for (const item of normalized) {
            if (!deduped.some(existing => existing.attackId === item.attackId)) {
              deduped.push(item)
            }
          }

          deduped.sort((a, b) => b.ts - a.ts)

          setItems(deduped)
          const newEtag = response.headers.get('etag')
          if (newEtag) {
            setEtag(newEtag)
          }
          setError(null)
          return
        }

        setItems([])
        setError(null)
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return
        }
        console.warn('[MarketRecentBattles] Fetch error:', err?.message || err)
        setError(err?.message || 'Failed to load battles')
      }
    }

    fetchBattles()
    intervalId = setInterval(fetchBattles, RECENT_BATTLES_POLL_MS)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [etag])

  if (!items.length && !error) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Attacks</h3>
        <p className="text-sm text-gray-400">No recent attacks yet</p>
      </div>
    )
  }

  return (
    <div className="card recent-attacks">
      <div className="card-header">
        <h3>⚔️ Recent Battles</h3>
      </div>
      {items.length === 0 && !error ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: 'var(--text-muted)',
            fontSize: '0.875rem'
          }}
        >
          No battles yet
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <tbody>
              {items.map((item, index) => {
                const isFree = Number(item.feeUSDC6 ?? '0') === 0
                return (
                  <tr
                    key={item.attackId}
                    data-free={isFree ? 'true' : 'false'}
                    title={isFree ? 'Free attack (no USDC fee)' : 'Paid attack'}
                    style={{
                      animation: index === 0 ? 'slideIn 0.3s ease-out' : 'none'
                    }}
                  >
                    <td
                      style={{
                        width: '60px',
                        textAlign: 'center',
                        padding: '0.5rem'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <img
                          src={getFlagImage(item.attackerCountry)}
                          alt={item.attackerCountry}
                          title={item.attackerCountry}
                          style={{
                            width: 'var(--flag-w, 48px)',
                            height: 'var(--flag-h, 36px)',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid var(--stroke)',
                            display: 'inline-block'
                          }}
                        />
                        <span
                          style={{ marginLeft: '6px', fontSize: '1rem' }}
                          title="attacker"
                        >
                          ⬆️
                        </span>
                      </span>
                    </td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 'var(--wallet-fs, 0.875rem)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        paddingRight: 'var(--wallet-pr, 0.75rem)'
                      }}
                    >
                      {item.attacker.slice(0, 8)}..
                    </td>
                    <td
                      style={{
                        width: 'var(--sword-w, 72px)',
                        textAlign: 'center',
                        fontSize: 'var(--sword-fs, 1.35rem)',
                        padding: '0 0.5rem'
                      }}
                    >
                      <span aria-label="attack">{attackIcon}</span>
                    </td>
                    <td
                      style={{
                        width: '60px',
                        textAlign: 'center',
                        padding: '0.5rem'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <img
                          src={getFlagImage(item.defenderCode)}
                          alt={item.defenderCode}
                          title={item.defenderCode}
                          style={{
                            width: 'var(--flag-w, 48px)',
                            height: 'var(--flag-h, 36px)',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid var(--stroke)',
                            display: 'inline-block'
                          }}
                        />
                        <span
                          style={{ marginLeft: '6px', fontSize: '1rem' }}
                          title="defender"
                        >
                          ⬇️
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (max-width: 480px) {
          .recent-attacks {
            --flag-w: 36px;
            --flag-h: 27px;
            --wallet-fs: 0.78rem;
            --wallet-pr: 0.5rem;
            --sword-w: 56px;
            --sword-fs: 1.2rem;
          }
          .recent-attacks .data-table {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}

//
// LOCAL HELPERS
//
function intTokensToWei(v: string): bigint {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0n;
  return BigInt(Math.trunc(n)) * 10n ** 18n;
}

function calcDeadline(sec: number) {
  return Math.floor(Date.now() / 1000) + sec;
}

function calcMinOut(usdc6: bigint): bigint {
  // %2 slippage
  return usdc6 - (usdc6 * 200n) / 10000n;
}

function formatUSDC(x: bigint) {
  // 6 dec
  const s = x.toString().padStart(7, "0");
  return s.slice(0, -6) + "." + s.slice(-6);
}

type Flag = { 
  id: number; 
  name: string; 
  flagImage: string; 
  code: string; 
  exists?: boolean;
  price?: string;
  totalSupply?: string;
};

// Test için 3 ülke
const flags: Flag[] = [
  { id: 90, name: "Turkey", flagImage: "/flags/TR.png", code: "TR" },
  { id: 44, name: "United Kingdom", flagImage: "/flags/UK.png", code: "GB" },
  { id: 1, name: "United States", flagImage: "/flags/USA.png", code: "US" },
];

function FlagCard({ flag, isSelected, onClick }: { flag: Flag; isSelected: boolean; onClick: () => void }) {
  const { data: countryInfo, isLoading, error } = useReadContract({
    address: CORE_ADDRESS as `0x${string}`,
    abi: [
      {
        "inputs": [{ "name": "id", "type": "uint256" }],
        "name": "countries",
        "outputs": [
          { "name": "name", "type": "string" },
          { "name": "token", "type": "address" },
          { "name": "exists", "type": "bool" },
          { "name": "price8", "type": "uint256" },
          { "name": "kappa8", "type": "uint32" },
          { "name": "lambda8", "type": "uint32" },
          { "name": "priceMin8", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: "countries",
    args: [BigInt(flag.id)],
  });

  // Read remaining supply (treasury inventory)
  const { data: remainingSupply } = useReadContract({
    address: CORE_ADDRESS as `0x${string}`,
    abi: [
      {
        "inputs": [{ "name": "id", "type": "uint256" }],
        "name": "remainingSupply",
        "outputs": [{ "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: "remainingSupply",
    args: [BigInt(flag.id)]
  });
  
  // countryInfo is now an array: [name, token, exists, price8, kappa8, lambda8, priceMin8]
  const liveP8 = (typeof window !== 'undefined' && (window as any).__fw_ssePrice8 && (window as any).__fw_ssePrice8[flag.id]) as bigint | undefined
  const price = liveP8 !== undefined
    ? (Number(liveP8) / 1e8).toFixed(6)
    : countryInfo ? (Number(countryInfo[3]) / 1e8).toFixed(6) : "0.000000";
  const remaining = remainingSupply ? (Number(remainingSupply) / 1e18).toLocaleString() : "0";
  const exists = countryInfo ? countryInfo[2] : false;

  return (
    <button 
      onClick={onClick}
      className="card"
      style={{
        border: isSelected ? '2px solid var(--gold)' : '1px solid var(--stroke)',
        background: isSelected ? 'var(--bg-panel-soft)' : 'var(--bg-panel)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.2s',
        padding: '0.75rem',
        minHeight: '140px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <div style={{marginBottom: '0.5rem'}}>
        <img 
          src={flag.flagImage} 
          alt={flag.name}
          style={{
            width: '48px',
            height: '36px',
            objectFit: 'cover',
            borderRadius: '4px',
            border: '1px solid var(--stroke)'
          }}
        />
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.25rem',
        gap: '0.25rem'
      }}>
        <div style={{
          fontWeight: '700',
          color: 'var(--text-dark)',
          fontSize: '0.7rem',
          background: 'var(--gold)',
          padding: '0.125rem 0.25rem',
          borderRadius: '0.25rem',
          minWidth: '24px',
          textAlign: 'center'
        }}>
          {flag.code}
        </div>
        <div style={{
          fontSize: '0.7rem',
          fontWeight: '600',
          color: 'var(--text-primary)'
        }}>
          ${price}
        </div>
      </div>
      <div style={{
        fontSize: '0.6rem',
        color: exists ? '#34d399' : '#ff4444',
        fontWeight: '600',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem'
      }}>
        {exists ? (
          <div>Available: {remaining}</div>
        ) : 'Not Deployed'}
      </div>
    </button>
  );
}

export default function MarketPage(){
  // Hydration guard: SSR/CSR farkını keser
  const [hydrated, setHydrated] = useState(false)
  
  const { isConnected, address } = useAccount();
  const chainId = useChainId()
  const toast = useToast()
  
  // Network guard
  const onWrongChain = chainId && chainId !== BASE_SEPOLIA_ID
  
  useEffect(() => setHydrated(true), [])
  
  // ❗️ Public client'ı component içinde ve lazy oluştur (top-level'den taşındı)
  const pub = useMemo(() => {
    const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
    return createPublicClient({
      chain: baseSepolia,
      transport: http(rpc),
    })
  }, [])
  
  // ❗️ Güvenli BigInt dönüşümü helper
  function safeToWeiInt(v: string | undefined): bigint {
    if (!v) return 0n
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) return 0n
    return BigInt(Math.trunc(n)) * 10n ** 18n
  }
  
  const [selected, setSelected] = useState<Flag|null>(null);
  const [amount, setAmount] = useState<string>("");
  const [buyAmount, setBuyAmount] = useState<string>("1");
  const [sellAmount, setSellAmount] = useState<string>("0");
  const [buyPrice, setBuyPrice] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  const [ssePrice8, setSsePrice8] = useState<Record<number, bigint>>({})
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'buy' | 'sell'>('buy')
  const [modalQuote, setModalQuote] = useState<any>(null)
  const [modalError, setModalError] = useState<string | undefined>(undefined)
  const [modalPending, setModalPending] = useState(false)
  const [modalStatus, setModalStatus] = useState<string | undefined>(undefined)
  const [modalHashShort, setModalHashShort] = useState<string | undefined>(undefined)
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successModalData, setSuccessModalData] = useState<{type: 'buy' | 'sell', amount: string, countryName: string} | null>(null)
  
  // Live price hook
  const price = usePrice(selected?.id)
  
  // Get token address for selected country
  const { data: countryData } = useReadContract({
    address: CORE_ADDRESS as `0x${string}`,
    abi: CORE_ABI,
    functionName: 'countries',
    args: selected ? [BigInt(selected.id)] : undefined,
    query: {
      enabled: !!selected,
    }
  })

  // User balance from token contract (not Core's getUserBalance)
  const tokenAddr = countryData?.[1] as `0x${string}` | undefined // token address
  const { data: userBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddr,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: address ? [address] : undefined
  })

  function sanitizeInteger (raw: string): string {
    const cleaned = raw.replace(/[^\d]/g, '')
    return cleaned
  }

  useEffect(() => {
    if(!selected && flags.length) setSelected(flags[0]);
  }, []);



  // Default sell amount based on actual balance
  useEffect(() => {
    try {
      const has = userBalance && typeof userBalance === 'bigint' ? (userBalance > 0n) : false
      setSellAmount(has ? '1' : '0')
    } catch { setSellAmount('0') }
  }, [address, userBalance])

  // SSE consumer for live price snapshots
  useEffect(() => {
    if (!selected) return
    let src: EventSource | null = null
    try {
      const url = `/api/sse/price?ids=${selected.id}`
      src = new EventSource(url)
      src.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { id: number, price8: string }
          if (data && typeof data.id === 'number' && data.price8) {
            setSsePrice8(prev => ({ ...prev, [data.id]: BigInt(data.price8) }))
            // expose minimal cache so flag cards can read without prop-drilling
            try { (window as any).__fw_ssePrice8 = { ...(window as any).__fw_ssePrice8, [data.id]: BigInt(data.price8) } } catch {}
          }
        } catch {}
      }
      src.onerror = () => { /* non-blocking */ }
    } catch {}
    return () => { if (src) src.close() }
  }, [selected?.id])

  // Auth is handled by isConnected from wagmi

  // Prefetch USDC balance/allowance on mount (5sn cache ile hızlandırır)
  useEffect(() => {
    if (!address || !isConnected) return
    ;(async () => {
      try {
        await fetch(`/api/erc20/balance?wallet=${address}`, { 
          cache: 'no-store',
          headers: { 'cache-control': 'no-cache' }
        })
        // Sonucu kullanmıyoruz, sadece cache'e alıyoruz
      } catch (e) {
        console.log('Prefetch balance failed:', e)
      }
    })()
  }, [address, isConnected])

  // Calculate buy/sell prices (canlı fiyat hook'undan)
  useEffect(() => {
    if (!selected || !buyAmount) {
      setBuyPrice("");
      return;
    }

    try {
      const P = price.data ? Number(price.data.price8) : 0 // Current price (PRICE8)
      const kappa = 55_000 // From contract config (0.00055 * 1e8)
      const n = Number(buyAmount) // Number of whole tokens
      
      if (n <= 0 || !Number.isInteger(n)) {
        setBuyPrice("");
        return;
      }

      // Arithmetic series formula: total_price8 = n*P + κ*n*(n-1)/2
      const linearTerm = n * P
      const quadraticTerm = (kappa * n * (n - 1)) / 2
      const totalPrice8 = linearTerm + quadraticTerm
      const totalUSDC = totalPrice8 / 1e8
      
      setBuyPrice(totalUSDC.toFixed(6));
    } catch (error) {
      console.error("Error calculating buy price:", error);
      setBuyPrice("Error");
    }
  }, [selected, buyAmount, price.data]);

  useEffect(() => {
    if (!selected || !sellAmount) {
      setSellPrice("");
      return;
    }

    try {
      const P = price.data ? Number(price.data.price8) : 0 // Current price (PRICE8)
      const lambda = 55_550 // From contract config (0.0005555 * 1e8)
      const n = Number(sellAmount) // Number of whole tokens
      
      if (n <= 0 || !Number.isInteger(n)) {
        setSellPrice("");
        return;
      }

      // Arithmetic series formula: total_price8 = n*P − λ*n*(n-1)/2
      const linearTerm = n * P
      const quadraticTerm = (lambda * n * (n - 1)) / 2
      const totalPrice8 = Math.max(linearTerm - quadraticTerm, 0)
      const grossUSDC = totalPrice8 / 1e8
      
      // No fee (sellFeeBps = 0 in contract)
      const netUSDC = grossUSDC
      
      setSellPrice(netUSDC.toFixed(6));
    } catch (error) {
      console.error("Error calculating sell price:", error);
      setSellPrice("Error");
    }
  }, [selected, sellAmount, price.data]);

  // const forceChainAndWallet = async () => {
  //   // Kullanılmıyor, yorum satırı yapıldı
  // }

  const readBalAndAlw = async (owner: `0x${string}`) => {
    const [bal, alw] = await Promise.all([
      pub.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner]
      }),
      pub.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, CORE_ADDRESS as `0x${string}`]
      }),
    ])
    return { bal: BigInt(bal as bigint), alw: BigInt(alw as bigint) }
  }

  const handleBuy = async () => {
    if (!isConnected || !selected || !buyAmount || buyAmount === '0') {
      console.log('[BUY] Missing required fields')
      return
    }
    
    console.log('[BUY] Starting...', { selected: selected.name, amount: buyAmount })
    
    try {
      const slippageBps = 200n // 2%
      const amt18 = intTokensToWei(buyAmount)
      
      // On-chain quote
      const [, , netUSDC6] = await pub.readContract({
        address: CORE_ADDRESS as `0x${string}`,
        abi: CORE_ABI,
        functionName: 'quoteBuy',
        args: [BigInt(selected.id), amt18]
      }) as [bigint, bigint, bigint]
      
      console.log('[BUY] quoteBuy result:', { netUSDC6: netUSDC6.toString() })
      
      // Slippage: maxIn = net + (net * slippage / 10000)
      const maxInUSDC6 = netUSDC6 + (netUSDC6 * slippageBps) / 10000n
      
      console.log('[BUY] Calculated max:', { 
        netUSDC6: netUSDC6.toString(), 
        slippageBps: slippageBps.toString(), 
        maxInUSDC6: maxInUSDC6.toString() 
      })
      
      // User balance and allowance
      const [bal, alw] = await Promise.all([
        pub.readContract({ 
          address: USDC_ADDRESS as `0x${string}`, 
          abi: erc20Abi, 
          functionName: 'balanceOf', 
          args: [address as `0x${string}`] 
        }) as Promise<bigint>,
        pub.readContract({ 
          address: USDC_ADDRESS as `0x${string}`, 
          abi: erc20Abi, 
          functionName: 'allowance', 
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`] 
        }) as Promise<bigint>
      ])
      
      setModalMode('buy')
      setModalError(undefined)
      setModalQuote({
        usdcTotal: netUSDC6,
        netUSDC6,
        maxInUSDC6,
        userUsdcBal: bal,
        usdcAllowance: alw,
        needApproval: alw < maxInUSDC6,
        allowance: alw,
        amountToken: buyAmount,
        countryName: selected.name
      })
      setModalOpen(true)
    } catch (e) {
      console.error('[BUY] Error:', e)
      toast.push({ text: 'Error fetching quote', type: 'error' })
    }
  };

  const handleSell = async () => {
    if (!isConnected || !selected || !sellAmount || sellAmount === '0') return
    if (!price.data) return

    try {
      // Fetch ALL data BEFORE opening modal to prevent flicker
      const [quoteResult, countryData, userBalResult] = await Promise.allSettled([
        // 1. Get sell quote from on-chain
        pub.readContract({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'quoteSell',
          args: [BigInt(selected.id), intTokensToWei(sellAmount)]
        }) as Promise<[bigint, bigint, bigint]>,
        
        // 2. Get country data (token address)
        pub.readContract({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'countries',
          args: [BigInt(selected.id)]
        }),
        
        // 3. Get user USDC balance
        address ? fetch(`/api/erc20/balance?wallet=${address}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } }).then(r => r.json()).then(d => d?.ok ? BigInt(d.balance) : 0n) : Promise.resolve(0n)
      ])

      const netUSDC6 = quoteResult.status === 'fulfilled' ? quoteResult.value[2] : 0n
      const c = countryData.status === 'fulfilled' ? countryData.value : null
      const tokenAddr = c ? (c as unknown as any[])[1] as `0x${string}` : undefined
      const userUsdcBal = userBalResult.status === 'fulfilled' ? userBalResult.value : 0n
      
      // Get token allowance (permit yok, sadece allowance kontrolü)
      let tokenAllowance = 0n
      if (address && tokenAddr) {
        try {
          tokenAllowance = await pub.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
          }) as bigint
        } catch (e) {
          console.error('[SELL] Error reading token allowance:', e)
        }
      }

      // Now open modal with all data ready
      if (!tokenAddr) {
        toast.push({ text: 'Token address not found', type: 'error' })
        return
      }
      
      const amountWei = intTokensToWei(sellAmount)
      const needsApproval = tokenAllowance < amountWei
      setModalQuote({
        usdcTotal: netUSDC6,
        userUsdcBal,
        needApproval: needsApproval,
        allowance: tokenAllowance,
        amountToken: sellAmount,
        countryName: selected.name,
        tokenAddress: tokenAddr
      } as any)
      setModalMode('sell')
      setModalError(undefined)
      setModalOpen(true)
    } catch (e) {
      console.error('[SELL] Error:', e)
      toast.push({ text: 'Error fetching quote', type: 'error' })
    }
  };

  // Auto-update modal quote when price loads - removed (calcBuyCostUSDC6Exact kaldırıldı, quote zaten handleBuy'da alınıyor)

  // Modal handlers
  const handleModalApprove = async () => {
    // Chain guard now handled by guardedWrite
    setModalPending(true)
    setModalError(undefined)
    setModalStatus('Waiting for approval in wallet...')
    
    // Guard: modalQuote must exist
    if (!modalQuote) {
      setModalError('Trade data missing, please try again.')
      setModalPending(false)
      return
    }
    
    try {
      if (!modalQuote?.needApproval || !address) return
      
      let newAllowance: bigint
      
      if (modalMode === 'buy') {
        // BUY: Approve USDC
        console.log('🔍 [APPROVE MODAL] Starting USDC approval...')
        
        // Dinamik import
        const { approveUsdcMax } = await import('@/lib/erc20')
        
        newAllowance = await approveUsdcMax(address)
        console.log('✅ [APPROVE MODAL] New USDC allowance from function:', newAllowance.toString())
        
        // IMMEDIATELY re-read from blockchain to verify
        const verifyAllowance = await pub.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        console.log('✅ [APPROVE MODAL] Re-read allowance from blockchain:', verifyAllowance.toString())
        
        if (verifyAllowance !== newAllowance) {
          console.error('❌ MISMATCH! Function returned:', newAllowance.toString(), 'but blockchain says:', verifyAllowance.toString())
        }
        
        toast.push({ text: 'USDC approved', type: 'success' })
      } else {
        // SELL: Approve country token (permit yok, sadece approve)
        console.log('🔍 [APPROVE MODAL] Starting token approval for SELL...')
        const tokenAddr = (modalQuote as any)?.tokenAddress as `0x${string}` | undefined
        
        if (!tokenAddr) {
          throw new Error('Token address not found in quote')
        }
        
        // Dinamik import
        const { guardedWrite, guardedWait } = await import('@/lib/guarded-tx')
        
        // Approve token
        const approveHash = await guardedWrite({
          address: tokenAddr,
          abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
          functionName: 'approve',
          args: [CORE_ADDRESS as `0x${string}`, maxUint256],
          chainId: 84532
        })
        
        console.log('✅ [APPROVE MODAL] Token approval tx sent:', approveHash)
        setModalStatus('Waiting for approval confirmation...')
        
        // Wait for confirmation
        await guardedWait({ hash: approveHash, pollingInterval: 1000 })
        
        // Verify allowance
        const verifyAllowance = await pub.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        
        console.log('✅ [APPROVE MODAL] Token allowance after approval:', verifyAllowance.toString())
        newAllowance = verifyAllowance
        
        toast.push({ text: 'Token approved', type: 'success' })
      }
      
      // Success → modal state güncelle
      setModalQuote((prev: any) => prev ? {
        ...prev,
        needApproval: false,
        allowance: newAllowance
      } : prev)
      
      setModalStatus('Approved ✓')
      
      // Wait 1 second to let the blockchain update
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      toast.push({ text: 'Ready to buy/sell', type: 'success' })
    } catch (error: any) {
      const message = error.message || 'Approval failed'
      if (message.includes('cancelled by user')) {
        setModalError('You cancelled the approval')
      } else {
        setModalError(message)
      }
      setModalStatus(undefined)
      toast.push({ text: message, type: 'error' })
    } finally {
      setModalPending(false)
    }
  }

  const handleModalConfirm = async () => {
    setModalPending(true)
    setModalError(undefined)
    setModalStatus(`${modalMode === 'buy' ? 'Buying' : 'Selling'}... open your wallet`)
    
    // Guard: modalQuote must exist
    if (!modalQuote) {
      setModalError('Trade data missing, please try again.')
      setModalPending(false)
      return
    }
    
    try {
      const amt18 = intTokensToWei(modalMode === 'buy' ? buyAmount : sellAmount)
      const deadline = BigInt(calcDeadline(900)) // 15 dk, daha güvenli
      
      let requiredMaxIn: bigint

      // --- EN BASİT & SAĞLAM PRE-FLIGHT ---
      // 1) Country check using countries(id) instead of getCountryInfo
      const c = await pub.readContract({ 
        address: CORE_ADDRESS, 
        abi: CORE_ABI, 
        functionName: 'countries', 
        args: [BigInt(selected!.id)] 
      })
      const exists = Boolean(c[2]) // exists is at index 2
      if (!exists) { setModalPending(false); setModalStatus(undefined); setModalError('Country is not deployed.'); return }

      // 2) For BUY: check USDC balance & allowance
      // For SELL: check country token balance & allowance
      let bal: bigint, alw: bigint
      let effectiveCap: bigint
      
      if (modalMode === 'buy') {
        // BUY: Get quote from contract
        const [, , netUSDC6] = await pub.readContract({
          address: CORE_ADDRESS,
          abi: CORE_ABI,
          functionName: 'quoteBuy',
          args: [BigInt(selected!.id), amt18]
        }) as [bigint, bigint, bigint]
        
        // Add 2% slippage to maxInUSDC6: net + (net * 200 / 10000)
        const maxInUSDC6 = netUSDC6 + (netUSDC6 * 200n) / 10000n
        
        // Read balance and allowance
        const [bal, alw] = await Promise.all([
          pub.readContract({ address: USDC_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [address as `0x${string}`] }) as Promise<bigint>,
          pub.readContract({ address: USDC_ADDRESS as `0x${string}`, abi: erc20Abi, functionName: 'allowance', args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`] }) as Promise<bigint>
        ])
        
        console.log('[BUY] Balance:', bal.toString(), 'Allowance:', alw.toString())
        console.log('[BUY] Need:', netUSDC6.toString(), 'Max:', maxInUSDC6.toString())
        
        // 1) Check balance first
        if (bal < netUSDC6) {
          setModalPending(false)
          setModalError(`Insufficient USDC balance. Need ${formatUSDC(netUSDC6)}, you have ${formatUSDC(bal)}.`)
          return
        }
        
        // 2) Check allowance
        if (alw < maxInUSDC6) {
          setModalPending(false)
          setModalError(`Insufficient USDC allowance. Need ≥ ${formatUSDC(maxInUSDC6)} approved. Please click Approve.`)
          setModalQuote((q: typeof modalQuote) => q ? { ...q, needApproval: true, usdcAllowance: alw } : q)
          return
        }
        
        // Both checks passed
        effectiveCap = maxInUSDC6
      } else {
        // SELL: Check token balance and allowance
        const tokenAddr = c[1] as `0x${string}`
        bal = await pub.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`]
        })
        alw = await pub.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        
        console.log('[SELL] Token balance:', bal.toString(), 'allowance:', alw.toString())
        console.log('[SELL] Token amount needed:', amt18.toString())
        
        // Check balance
        if (amt18 > bal) {
          setModalPending(false)
          setModalStatus(undefined)
          setModalError('Insufficient token balance.')
          return
        }
        
        // Check allowance - if insufficient, user must approve first
        if (alw < amt18) {
          setModalPending(false)
          setModalStatus(undefined)
          setModalError('Insufficient token allowance. Please click Approve first.')
          setModalQuote((q: any) => q ? { ...q, needApproval: true } : q)
          return
        }
      }
      
      // Address guard: Yanlış CORE'a çağrı atıyorsak "unknown revert" görürüz
      if (CORE_ADDRESS.toLowerCase() !== EXPECTED_CORE.toLowerCase()) {
        setModalError(`Wrong CORE address in env. Got ${CORE_ADDRESS}, expected ${EXPECTED_CORE}`)
        setModalPending(false)
        return
      }
      
      // 2.5) FINAL allowance check - re-read from blockchain and verify Core's USDC address
      if (modalMode === 'buy') {
        // First, verify Core is using the correct USDC address
        const coreUsdcAddress = await pub.readContract({
          address: CORE_ADDRESS as `0x${string}`,
          abi: CORE_ABI,
          functionName: 'USDC'
        })
        console.log('[VERIFY] Core contract USDC address:', coreUsdcAddress)
        console.log('[VERIFY] Our USDC address:', USDC_ADDRESS)
        
        if (coreUsdcAddress.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
          console.error('❌ MISMATCH! Core is using different USDC address!')
          setModalPending(false)
          setModalStatus(undefined)
          setModalError(`Core contract uses different USDC (${coreUsdcAddress}). Please check deployment.`)
          return
        }
        
        const finalAllowance = await pub.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        console.log('[BUY FINAL CHECK] Allowance from blockchain:', finalAllowance.toString())
        
        // If still insufficient, tell user to approve
        if (finalAllowance === 0n || finalAllowance < effectiveCap!) {
          setModalPending(false)
          setModalStatus(undefined)
          setModalError(`Insufficient allowance (${finalAllowance} < ${effectiveCap!}). Please click Approve button first.`)
          return
        }
      }
      
      // 3) Skip simulation - go directly to writeContract
      // Simulation can have stale state issues with allowances
      // Chain guard now handled by guardedWrite
      
      setModalStatus(modalMode === 'buy' ? 'Buying... open your wallet' : 'Sign permit in your wallet...')
      
      // 4) İşlemi gönder
      if (modalMode === 'buy') {
        requiredMaxIn = effectiveCap!
        
        console.log('[WRITE] Calling writeContract with:', {
          functionName: 'buy',
          args: [selected!.id, amt18.toString(), effectiveCap!.toString(), deadline.toString()]
        })
        
        console.log('[CONFIRM] About to call writeContract with:', {
          address: CORE_ADDRESS,
          functionName: 'buy',
          args: {
            id: selected!.id,
            amount18: amt18.toString(),
            maxInUSDC6: effectiveCap!.toString(),
            deadline: deadline.toString()
          },
          userAddress: address,
          chainId: 84532
        })
      } else {
        console.log('[WRITE] Calling writeContract with:', {
          functionName: 'sell',
          args: [selected!.id, amt18.toString(), calcMinOut(modalQuote!.usdcTotal).toString(), deadline.toString()]
        })
        
        console.log('[CONFIRM] About to call writeContract with:', {
          address: CORE_ADDRESS,
          functionName: 'sell',
          args: {
            id: selected!.id,
            amount18: amt18.toString(),
            minOutUSDC6: calcMinOut(modalQuote!.usdcTotal).toString(),
            deadline: deadline.toString()
          },
          userAddress: address,
          chainId: 84532
        })
      }
      
      // CRITICAL: Final allowance check RIGHT before transaction
      if (modalMode === 'buy') {
        const finalCheck = await pub.readContract({
          address: USDC_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        console.log('[CRITICAL] Final allowance check RIGHT before writeContract:', finalCheck.toString())
        
        if (finalCheck === 0n) {
          throw new Error('CRITICAL: Allowance is 0 right before transaction! Please approve first.')
        }
      }
      
      let txHash: `0x${string}`
      
      // Dinamik import
      const { guardedWrite } = await import('@/lib/guarded-tx')
      
      if (modalMode === 'buy') {
        // BUY: Standard flow with maxIn slippage
        txHash = await guardedWrite({
          address: CORE_ADDRESS as `0x${string}`,
          abi: CORE_ABI,
          functionName: 'buy',
          args: [BigInt(selected!.id), amt18, effectiveCap!, deadline],
          chainId: 84532
        })
      } else {
        // SELL: Basit sell (permit yok)
        const tokenAddr = c[1] as `0x${string}`
        const tokenAllowance = await pub.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        
        // Dinamik import
        const { guardedWrite } = await import('@/lib/guarded-tx')
        
        if (tokenAllowance < amt18) {
          // Insufficient allowance - user must approve first
          setModalPending(false)
          setModalStatus(undefined)
          setModalError('Insufficient token allowance. Please click Approve first.')
          setModalQuote((q: any) => q ? { ...q, needApproval: true } : q)
          return
        }
        
        // Allowance sufficient - use standard sell
        console.log('[SELL] Sufficient allowance, using standard sell')
        txHash = await guardedWrite({
          address: CORE_ADDRESS as `0x${string}`,
          abi: CORE_ABI,
          functionName: 'sell',
          args: [BigInt(selected!.id), amt18, calcMinOut(modalQuote!.usdcTotal), deadline],
          chainId: 84532
        })
      }
      
      console.log('[CONFIRM] writeContract returned txHash:', txHash)
      
      if (!txHash) {
        throw new Error('Transaction hash is undefined. Check wallet connection and chain ID.')
      }
      
      setModalStatus('Transaction sent, waiting for confirmation...')
      setModalHashShort(txHash ? `${txHash.slice(0, 6)}...${txHash.slice(-4)}` : undefined)
      
      // Toast: işlem gönderildi
      toast.push({ text: `${modalMode === 'buy' ? 'Buy' : 'Sell'} transaction sent`, type: 'info' })
      
      // 1 sn sonra modalı kapat (transaction arka planda onaylanacak)
      setTimeout(() => setModalOpen(false), 1000)
      
      // 3) Transaction confirmation'ı bekle (arka planda)
      // Kısa delay sonra başla (transaction indexlenmesi için)
      setTimeout(async () => {
        // Dinamik import
        const { guardedWait } = await import('@/lib/guarded-tx')
        guardedWait({
          hash: txHash,
          pollingInterval: 1000, // Her 1 saniyede bir kontrol
        }).then((receipt: any) => {
          if (receipt.status === 'success') {
            // Cache invalidation (async, fire-and-forget)
            if (typeof window !== 'undefined') {
              // Client-side - fetch API endpoint for cache invalidation
              fetch(`/api/cache/invalidate?countryId=${selected!.id}`, { method: 'POST' }).catch(() => {})
            }

            // Show success modal
            setSuccessModalData({
              type: modalMode,
              amount: modalMode === 'buy' ? buyAmount : sellAmount,
              countryName: selected!.name
            })
            setShowSuccessModal(true)
            
            // Fiyatı güncelle
            price.refetch()
            
            // Update user_balances DB first (DB + Redis model)
            fetch('/api/profile/update-balance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                countryId: selected!.id,
                amount: modalMode === 'buy' ? buyAmount : sellAmount,
                direction: modalMode === 'buy' ? 1 : -1, // +1 for buy, -1 for sell
                txHash: txHash
              })
            }).then(() => {
              // Balance'ı güncelle (DB güncellemesinden sonra)
              setTimeout(() => refetchBalance(), 500)
            }).catch((e) => console.error('Update balance failed:', e))
            
            // Update referral activity (mark user as active)
            fetch(`/api/referral/activity/${modalMode}`, {
              method: 'POST',
              credentials: 'include'
            }).catch(() => {}) // Non-critical, don't block UX
            
            // Achievement tracking (buy/sell activity)
            fetch('/api/achievements/record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                type: modalMode, // 'buy' or 'sell'
              })
            }).catch(() => {})
          } else {
            toast.push({ text: `${modalMode === 'buy' ? 'Buy' : 'Sell'} failed`, type: 'error' })
          }
        }).catch((e: any) => {
          console.error('Transaction confirmation error:', e)
          // Transaction gönderildi ama confirmation bulunamadı
          // Basescan linkini gösterelim - kullanıcı manuel kontrol edebilir
          toast.push({ text: `Transaction sent! Check: basescan.org/tx/${txHash.slice(0, 10)}...`, type: 'info' })
          // ❌ Fiyatı GÜNCELLEME - sadece confirmed transaction'larda güncelle
        })
      }, 1500) // 1.5 saniye bekle
      
    } catch (error: any) {
      console.error('[MODAL CONFIRM ERROR]', error)
      console.error('[ERROR DATA]', error?.data)
      console.error('[ERROR CAUSE]', error?.cause)
      
      // Try to decode error
      try {
        const data = error?.data ?? error?.cause?.data
        if (data) {
          const dec = decodeErrorResult({ abi: CORE_ABI, data })
          console.error('[DECODED ERROR]', dec)
          setModalError(`Contract error: ${dec.errorName}`)
          return
        }
      } catch {}
      
      setModalStatus(undefined)
      
      // User reject mesajı
      const isUserReject = error?.message?.includes('User rejected') || 
                          error?.message?.includes('User denied') ||
                          error?.message?.includes('rejected the request')
      
      // Basit error mesajı (translateError dinamik import gerektirir, şimdilik basit)
      let msg = isUserReject 
        ? 'You cancelled the transaction'
        : error?.message || 'Transaction failed. Check your wallet and try again.'
      
      // Try to decode contract error
      try {
        const data = error?.data ?? error?.cause?.data
        if (data) {
          const dec = decodeErrorResult({ abi: CORE_ABI, data })
          msg = `Contract error: ${dec.errorName}`
        }
      } catch {}
      
      setModalError(msg)
      toast.push({ text: msg, type: 'error' })
    } finally {
      setModalPending(false)
    }
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setModalError(undefined)
    setModalStatus(undefined)
    setModalHashShort(undefined)
    setModalQuote(null)
  }

  if (!hydrated) return null

  return (
    <div>
      <h1>🏪 Market</h1>
      <p style={{marginBottom: '2rem'}}>Trade country flags and build your portfolio</p>
      
      {/* Network Warning Banner */}
      {onWrongChain && (
        <div style={{
          background: 'linear-gradient(135deg, #ff6b6b, #ee5a6f)',
          color: '#fff',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          textAlign: 'center',
          fontWeight: '600'
        }}>
          ⚠️ Please switch to Base Sepolia network (Chain ID: {BASE_SEPOLIA_ID})
        </div>
      )}
      
      <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem'}}>
        {/* Flags Grid */}
        <div className="card">
          <div className="card-header">
            <h2>Available Flags (3 Countries)</h2>
          </div>
          <div className="market-flags-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem'
          }}>
            {flags.map(flag => (
              <FlagCard
                key={flag.id}
                flag={flag}
                isSelected={selected?.id === flag.id}
                onClick={() => setSelected(flag)}
              />
            ))}
          </div>
        </div>

        {/* Trading Panel */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          {selected && (
            <div className="card">
              <div className="card-header">
                <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                  <img 
                    src={selected.flagImage} 
                    alt={selected.name}
                    style={{
                      width: '40px',
                      height: '30px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid var(--stroke)'
                    }}
                  />
                  <div>
                    <h3 style={{margin: 0}}>Trade {selected.name}</h3>
                    <p style={{margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                      {selected.code} • Contract Data
                    </p>
                  </div>
                </div>
              </div>
              <div style={{marginBottom: '1rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
                  <label style={{fontWeight: '500', fontSize: '0.875rem', margin: 0}}>
                    Amount (Tokens)
                  </label>
                  {userBalance !== undefined && (
                    <span style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>
                      Balance: {(Number(userBalance) / 1e18).toLocaleString()}
                    </span>
                  )}
                </div>
                
                {/* Input with increment/decrement buttons */}
                <div style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: '0.5rem',
                  marginBottom: '0.75rem'
                }}>
                  <button
                    onClick={() => {
                      const current = Number(buyAmount) || 0
                      if (current > 0) {
                        const newVal = String(current - 1)
                        setBuyAmount(newVal)
                        setSellAmount(newVal)
                      }
                    }}
                    style={{
                      width: '40px',
                      padding: '0',
                      border: '1px solid var(--stroke)',
                      borderRadius: '0.5rem',
                      background: 'var(--bg-panel-soft)',
                      color: 'var(--text-primary)',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-panel-soft)'}
                  >
                    −
                  </button>
                  
                  <input 
                    inputMode="numeric"
                    type="text"
                    pattern="\\d+"
                    placeholder="Enter amount"
                    value={buyAmount}
                    onChange={(e) => {
                      const sanitized = sanitizeInteger(e.target.value)
                      setBuyAmount(sanitized)
                      setSellAmount(sanitized)
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      border: '1px solid var(--stroke)',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                      background: 'var(--bg-panel-soft)',
                      color: 'var(--text-primary)',
                      textAlign: 'center',
                      fontWeight: '500'
                    }}
                  />
                  
                  <button
                    onClick={() => {
                      const current = Number(buyAmount) || 0
                      const newVal = String(current + 1)
                      setBuyAmount(newVal)
                      setSellAmount(newVal)
                    }}
                    style={{
                      width: '40px',
                      padding: '0',
                      border: '1px solid var(--stroke)',
                      borderRadius: '0.5rem',
                      background: 'var(--bg-panel-soft)',
                      color: 'var(--text-primary)',
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-panel)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-panel-soft)'}
                  >
                    +
                  </button>
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem'}}>
                <button 
                  className="btn btn-primary"
                  onClick={handleBuy}
                  disabled={!isConnected || !buyAmount || buyAmount==='0' || (modalOpen && modalMode==='buy')}
                  style={{ opacity: (!isConnected || !buyAmount || buyAmount==='0' || (modalOpen && modalMode==='buy')) ? 0.5 : 1 }}
                >
                  {(modalOpen && modalMode==='buy') ? 'Buying...' : 'Buy'}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={handleSell}
                  disabled={
                    !isConnected || 
                    !sellAmount || 
                    sellAmount==='0' || 
                    (modalOpen && modalMode==='sell') ||
                    !userBalance ||
                    userBalance === 0n ||
                    safeToWeiInt(sellAmount) > userBalance
                  }
                  style={{ 
                    opacity: (
                      !isConnected || 
                      !sellAmount || 
                      sellAmount==='0' || 
                      (modalOpen && modalMode==='sell') ||
                      !userBalance ||
                      userBalance === 0n ||
                      safeToWeiInt(sellAmount) > userBalance
                    ) ? 0.5 : 1 
                  }}
                >
                  {(modalOpen && modalMode==='sell') ? 'Selling...' : 'Sell'}
                </button>
              </div>
              {/* Removed server trade section as requested */}
              <div style={{
                padding: '1rem',
                background: 'var(--bg-panel-soft)',
                borderRadius: '0.5rem',
                border: '1px solid var(--stroke)'
              }}>
                <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                  Status: {isConnected ? '✅ Logged In' : '❌ Not Logged In'}
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity - Dynamic Attack Feed */}
          <RecentBattles />
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmTradeModal
        open={modalOpen}
        mode={modalMode}
        quote={modalQuote}
        pending={modalPending}
        onApprove={handleModalApprove}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
        error={modalError}
        statusMsg={modalStatus}
        txHashShort={modalHashShort}
      />

      {/* Success Modal */}
      {successModalData && (
        <TradeSuccessModal
          show={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false)
            setSuccessModalData(null)
          }}
          type={successModalData.type}
          amount={successModalData.amount}
          countryName={successModalData.countryName}
        />
      )}
    </div>
  );
}
