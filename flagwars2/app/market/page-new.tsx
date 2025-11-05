"use client"

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { writeContract } from 'wagmi/actions'
import { config } from '@/app/providers'
import { CORE_ADDRESS, USDC_ADDRESS } from '@/lib/addresses'
import { CORE_ABI } from '@/lib/core-abi'
import { parseAbi, maxUint256 } from 'viem'

const USDC_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
])

const FLAGS = [
  { id: 90, name: "Turkey", code: "TR", flag: "/flags/TR.png" },
  { id: 44, name: "United Kingdom", code: "GB", flag: "/flags/UK.png" },
  { id: 1, name: "United States", code: "US", flag: "/flags/USA.png" },
]

export default function MarketPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const walletClient = useWalletClient()
  const [selectedId, setSelectedId] = useState(90)
  const [amount, setAmount] = useState('1')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const handleBuy = async () => {
    if (!address || !publicClient || !amount) return
    setLoading(true)
    try {
      // 1) USDC balance & allowance
      const [bal, alw] = await Promise.all([
        publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'balanceOf', args: [address] }),
        publicClient.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'allowance', args: [address, CORE_ADDRESS] }),
      ])
      setStatus(`Balance: ${bal}, Allowance: ${alw}`)

      // 2) Approve if needed
      if (alw < bal) {
        setStatus('Approving USDC...')
        const hash = await writeContract(config, {
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [CORE_ADDRESS, maxUint256],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        setStatus('Approved. Buying...')
      }

      // 3) Buy
      const amount18 = BigInt(amount) * 10n**18n
      const cap = bal < alw ? bal : alw
      const deadline = BigInt(Math.floor(Date.now()/1000) + 900)

      const txHash = await writeContract(config, {
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'buy',
        args: [BigInt(selectedId), amount18, cap, deadline],
      })
      setStatus(`Buy tx sent: ${txHash.slice(0,8)}...`)
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      setStatus(receipt.status === 'success' ? '✓ Buy successful!' : '✗ Buy failed')
    } catch (e: any) {
      setStatus(`Error: ${e?.shortMessage || e?.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSell = async () => {
    if (!address || !publicClient || !amount) return
    setLoading(true)
    try {
      const amount18 = BigInt(amount) * 10n**18n
      const minOut = 0n
      const deadline = BigInt(Math.floor(Date.now()/1000) + 900)

      const txHash = await writeContract(config, {
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: 'sell',
        args: [BigInt(selectedId), amount18, minOut, deadline],
      })
      setStatus(`Sell tx sent: ${txHash.slice(0,8)}...`)

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      setStatus(receipt.status === 'success' ? '✓ Sell successful!' : '✗ Sell failed')
    } catch (e: any) {
      setStatus(`Error: ${e?.shortMessage || e?.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: 'auto' }}>
      <h1>FlagWars Market</h1>
      <p>Select country & amount, then Buy or Sell</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        {FLAGS.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedId(f.id)}
            disabled={loading}
            style={{
              padding: '1rem',
              border: selectedId === f.id ? '2px solid blue' : '1px solid gray',
              cursor: 'pointer'
            }}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <label>Amount: </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
          min="1"
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={handleBuy} disabled={!isConnected || loading}>
          BUY
        </button>
        <button onClick={handleSell} disabled={!isConnected || loading}>
          SELL
        </button>
      </div>

      {status && <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f0f0' }}>{status}</div>}
    </div>
  )
}
