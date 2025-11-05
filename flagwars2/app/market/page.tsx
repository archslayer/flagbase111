"use client";
import { useEffect, useState } from "react";
//
import { useAccount, useReadContract, useChainId } from "wagmi";
import { writeContract, simulateContract, getChainId, switchChain, getWalletClient, signTypedData, readContract } from 'wagmi/actions'
import { waitReceiptSafe } from '@/utils/tx'
import { config } from '@/app/providers'
import { decodeErrorResult, maxUint256, getAddress } from 'viem'
import { ConnectAndLogin } from "@/components/ConnectAndLogin";
import ConfirmTradeModal from '@/components/ConfirmTradeModal'
import { TradeSuccessModal } from '@/components/TradeSuccessModal'
import { coreRead, createCoreWriter, calculateSlippage, formatUSDC } from "@/lib/core";
import { intTokensToWei, calcMinOut, calcMaxIn, calcDeadline, calcBuyCostUSDC6Exact, calcSellProceedsUSDC6Exact } from '@/lib/amount'
import { approveWithWallet, readUsdcAllowance, approveUsdcMax } from '@/lib/erc20'
import { findRequiredMaxInUSDC6, translateError } from '@/lib/tx-sim'
import { checkAllowanceForBothCores } from '@/lib/allowance-check'
import { toBigIntSafe, needsApproval, E18, E6 } from '@/lib/bigint-utils'
import { useToast } from '@/components/Toast'
import { usePrice } from '@/lib/usePrice'
import { guardedWrite, guardedWait } from '@/lib/guarded-tx'
import { requireBaseSepolia } from '@/lib/chain-guard'
import { BASE_SEPOLIA_ID } from '@/lib/chains'
import { CORE_ABI } from '@/lib/core-abi'
import { ERC20_PERMIT_ABI } from '@/lib/erc20-permit-abi'
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'
import RecentAttacks from '@/components/market/RecentAttacks'

// Contract addresses - centralized
import { CORE_ADDRESS, USDC_ADDRESS, EXPECTED_CORE } from '@/lib/addresses'

// Pre-flight check için public client ve ABI
const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)'
])
const rpc = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) })

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

  const CHAIN_ID = 84532 // Base Sepolia

  const forceChainAndWallet = async () => {
    const wc = await getWalletClient(config).catch(() => null)
    if (!wc) throw new Error('Cüzdan bağlı değil')
    try {
      const cur = await getChainId(config)
      if (cur !== CHAIN_ID) {
        await switchChain(config, { chainId: CHAIN_ID })
      }
    } catch {
      // Chain switch failed
    }
    return wc
  }

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
      
      // Get token allowance if we have token address
      let tokenAllowance = 0n
      if (address && tokenAddr) {
        try {
          tokenAllowance = await pub.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
          })
        } catch (e) {
          console.error('[SELL] Error reading token allowance:', e)
        }
      }

      // Now open modal with all data ready
      setModalQuote({
        usdcTotal: netUSDC6,
        userUsdcBal,
        needApproval: false,
        allowance: tokenAllowance,
        amountToken: sellAmount,
        countryName: selected.name,
        tokenAddr
      })
      setModalMode('sell')
      setModalError(undefined)
      setModalOpen(true)
    } catch (e) {
      console.error('[SELL] Error:', e)
      toast.push({ text: 'Error fetching quote', type: 'error' })
    }
  };

  // Auto-update modal quote when price loads (for exact BigInt calculation)
  useEffect(() => {
    // Modal açıksa ve BUY modundaysa, price hazır olduğunda exact BigInt ile güncelle
    if (!modalOpen || modalMode !== 'buy' || !modalQuote) return
    if (!selected || !buyAmount || buyAmount === '0') return
    if (!price?.data) return

    try {
      const n         = BigInt(buyAmount)
      const P8        = BigInt(price.data.price8)
      const kappa     = 55_000n  // Fixed value from Core deployment
      const buyFeeBps = 0n       // Fees are 0 in new Core

      const exactResult = calcBuyCostUSDC6Exact(n, P8, kappa, buyFeeBps)
      
      // Only update if value changed to prevent infinite loop
      if (modalQuote.usdcTotal !== exactResult.netUSDC6) {
        setModalQuote((q: any) => q ? { ...q, usdcTotal: exactResult.netUSDC6 } : q)
      }
    } catch {}
  // Remove modalQuote from dependencies to prevent infinite loop
  }, [modalOpen, modalMode, selected?.id, buyAmount, price?.data?.price8])

  // Modal handlers
  const handleModalApprove = async () => {
    // Chain guard now handled by guardedWrite
    setModalPending(true)
    setModalError(undefined)
    setModalStatus('Waiting for approval in wallet...')
    
    try {
      if (!modalQuote?.needApproval || !address) return
      
      let newAllowance: bigint
      
      if (modalMode === 'buy') {
        // BUY: Approve USDC
        console.log('🔍 [APPROVE MODAL] Starting USDC approval...')
        console.log('🔍 [APPROVE MODAL] CORE_ADDRESS from env:', CORE_ADDRESS)
        console.log('🔍 [APPROVE MODAL] USDC_ADDRESS:', USDC_ADDRESS)
        console.log('🔍 [APPROVE MODAL] User address:', address)
        
        // Preflight: allowance her iki CORE için de kontrol
        try {
          const allowanceCheck = await checkAllowanceForBothCores(address)
          console.log('🔍 [APPROVE MODAL] Allowance check result:', allowanceCheck)
          if (allowanceCheck.oldCoreAllowance > 0n && allowanceCheck.newCoreAllowance === 0n) {
            console.warn('⚠️ Eski core\'a onay verilmiş, yeni core\'a verin')
          }
        } catch (error) {
          console.warn('Allowance check failed:', error)
        }
        
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
        // SELL: No approval needed - permit signature will be requested in handleModalConfirm
        throw new Error('SELL does not require manual approval. Use permit signature instead.')
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
        // SELL: Check token balance only (allowance yetersizse permit kullanacağız)
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
        
        // Only check balance - if insufficient, fail. Allowance will be handled by permit path below.
        if (amt18 > bal) {
          setModalPending(false)
          setModalStatus(undefined)
          setModalError('Insufficient token balance.')
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
        // SELL: Check if permit is needed (allowance insufficient)
        const tokenAddr = c[1] as `0x${string}`
        const tokenAllowance = await pub.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
        })
        
        if (tokenAllowance < amt18) {
          // Need permit - use sellWithPermit
          console.log('[SELL] Insufficient allowance, using sellWithPermit (EIP-2612)')
          
          // 1) Read token name and nonce for permit signature (feature detection)
          let tokenName: string
          let nonce: bigint
          try {
            tokenName = await readContract(config, {
              address: tokenAddr,
              abi: ERC20_PERMIT_ABI,
              functionName: 'name'
            }) as string

            nonce = await readContract(config, {
              address: tokenAddr,
              abi: ERC20_PERMIT_ABI,
              functionName: 'nonces',
              args: [address as `0x${string}`]
            }) as bigint
          } catch (e) {
            // Token EIP-2612 desteklemiyor → fallback: approve akışı
            console.log('[SELL] Token does not support EIP-2612 permit, fallback to approve')
            setModalPending(false)
            setModalStatus(undefined)
            setModalError('This token does not support EIP-2612 permit. Please approve once and retry.')
            setModalQuote((q: any) => q ? { ...q, needApproval: true } : q)
            return
          }
          
          const currentChainId = await getChainId(config)
          const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60) // 10 minutes
          
          // Try to read version (optional, fallback to '1')
          let version = '1'
          try {
            version = await readContract(config, {
              address: tokenAddr,
              abi: parseAbi(['function version() view returns (string)']),
              functionName: 'version',
            }) as string
          } catch {}
          
          // 2) EIP-712 typed data for permit
          const domain = {
            name: tokenName,
            version,
            chainId: currentChainId,
            verifyingContract: getAddress(tokenAddr) // Checksummed address
          }
          
          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          }
          
          // 🎯 Permit value must match contract's permit() call exactly
          // Contract calls: permit(msg.sender, address(this), amount18, ...)
          // So we must sign with amount18 (not maxUint256)
          const message = {
            owner: getAddress(address!), // Checksummed address
            spender: getAddress(CORE_ADDRESS), // Checksummed address
            value: amt18, // ✅ Must match contract's permit() call
            nonce: BigInt(nonce as bigint),
            deadline: permitDeadline,
          }
          
          console.log('[SELL PERMIT DEBUG]', {
            tokenAddr,
            tokenName,
            version,
            chainId: currentChainId,
            owner: address,
            spender: CORE_ADDRESS,
            value: amt18.toString(),
            nonce: nonce.toString(),
            deadline: permitDeadline.toString(),
          })
          
          console.log('[SELL] Signing permit with exact amount for this transaction')
          
          // 3) Sign typed data
          console.log('[SELL] Requesting permit signature...')
          setModalStatus('Sign permit in your wallet...')
          
          const signature = await signTypedData(config, {
            domain,
            types,
            primaryType: 'Permit',
            message,
          })
          
          // 4) Extract v, r, s from signature
          const r = `0x${signature.slice(2, 66)}` as `0x${string}`
          const s = `0x${signature.slice(66, 130)}` as `0x${string}`
          let v = Number(`0x${signature.slice(130, 132)}`)
          // Normalize v to 27/28 (some wallets return 0/1)
          if (v < 27) v += 27
          
          console.log('[SELL] Permit signature obtained, calling sellWithPermit...')
          
          // 5) Call sellWithPermit with signature
          try {
            txHash = await guardedWrite({
              address: CORE_ADDRESS as `0x${string}`,
              abi: CORE_ABI,
              functionName: 'sellWithPermit',
              args: [
                BigInt(selected!.id),
                amt18,
                calcMinOut(modalQuote!.usdcTotal),
                deadline, // tradeDeadline
                permitDeadline,
                v,
                r,
                s
              ],
              chainId: 84532
            })
          } catch (permitError: any) {
            console.error('[SELL] sellWithPermit failed, falling back to approve + sell:', permitError)
            
            // Fallback: Approve token then call standard sell()
            setModalStatus('Permit failed, requesting token approval...')
            
            // Approve Core to spend user's country tokens
            const approveTx = await guardedWrite({
              address: tokenAddr,
              abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
              functionName: 'approve',
              args: [CORE_ADDRESS as `0x${string}`, maxUint256],
              chainId: 84532
            })
            
            console.log('[SELL FALLBACK] Approval tx sent:', approveTx)
            setModalStatus('Approval sent, waiting...')
            
            // Wait for approval confirmation
            await waitReceiptSafe(approveTx, { confirmations: 1, timeout: 60_000, pollingInterval: 1000 })
            
            console.log('[SELL FALLBACK] Approval confirmed, calling sell()...')
            setModalStatus('Selling...')
            
            // Now call standard sell()
            txHash = await guardedWrite({
              address: CORE_ADDRESS as `0x${string}`,
              abi: CORE_ABI,
              functionName: 'sell',
              args: [BigInt(selected!.id), amt18, calcMinOut(modalQuote!.usdcTotal), deadline],
              chainId: 84532
            })
          }
        } else {
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
      setTimeout(() => {
        waitReceiptSafe(txHash, {
          confirmations: 1,
          timeout: 60_000, // 60 saniye timeout
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
      
      const msg = isUserReject 
        ? 'You cancelled the transaction'
        : translateError(error) // Use translateError for user-friendly messages
      
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
                    BigInt(sellAmount || 0) * BigInt(1e18) > userBalance
                  }
                  style={{ 
                    opacity: (
                      !isConnected || 
                      !sellAmount || 
                      sellAmount==='0' || 
                      (modalOpen && modalMode==='sell') ||
                      !userBalance ||
                      userBalance === 0n ||
                      BigInt(sellAmount || 0) * BigInt(1e18) > userBalance
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
          <RecentAttacks />
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
