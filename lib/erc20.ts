import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { toChecksumAddress } from '@/lib/validate'
import { guardedWrite, guardedWait } from '@/lib/guarded-tx'
import { BASE_SEPOLIA_RPC } from '@/lib/chains'

// Centralized address management
import { CORE_ADDRESS, USDC_ADDRESS } from '@/lib/addresses'

// Use addresses directly from centralized source
export const USDC = USDC_ADDRESS
export const CORE = CORE_ADDRESS

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
])

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(BASE_SEPOLIA_RPC)
})

export async function readUsdcBalance(addr: string): Promise<bigint> {
  return await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [toChecksumAddress(addr)]
  })
}

export async function readUsdcAllowance(addr: string): Promise<bigint> {
  return await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [toChecksumAddress(addr), CORE]
  })
}

export async function approveUsdcIfNeeded(required: bigint, userAddress: string): Promise<{ approved: boolean, hash?: string }> {
  const current = await readUsdcAllowance(userAddress)
  if (current >= required) {
    return { approved: true }
  }

  // This would need wallet client in frontend - for now just return need for approval
  return { approved: false }
}

export async function getUsdcDecimals(): Promise<number> {
  return await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'decimals'
  })
}

export async function approveWithWallet(required: bigint): Promise<string> {
  try {
    console.log('🔄 Starting USDC approve transaction...', { required: required.toString() })
    
    const writeStart = Date.now()

    const hash = await guardedWrite({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CORE, required],
    })

    const writeLatency = Date.now() - writeStart
    console.log('✅ USDC approve transaction sent:', { hash, writeLatency })

    // Kullanıcı deneyimi için onay bekleyelim
    const receiptStart = Date.now()
    const receipt = await guardedWait({ hash })
    const receiptLatency = Date.now() - receiptStart

    if (receipt.status !== 'success') {
      console.error('❌ USDC approve transaction failed:', { hash, receiptLatency })
      throw new Error('Transaction failed')
    }

    console.log('✅ USDC approve transaction confirmed:', { hash, receiptLatency })
    return hash
  } catch (error: any) {
    // User-friendly error messages
    if (error?.message?.includes('User rejected') || 
        error?.message?.includes('User denied') ||
        error?.message?.includes('rejected the request')) {
      throw new Error('Approval cancelled by user')
    }
    if (error?.message?.includes('Approval cancelled')) {
      throw error
    }
    throw new Error('Approval failed: ' + (error?.message || 'Unknown error'))
  }
}

// Yeni approve fonksiyonu - tek kaynak adreslerle
export async function approveUsdcMax(ownerAddr: `0x${string}`): Promise<bigint> {
  try {
    console.log('[APPROVE START]', { owner: ownerAddr, USDC_ADDRESS, spender: CORE_ADDRESS })

    const result = await guardedWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CORE_ADDRESS, 2n**256n - 1n],
    })
    
    console.log('[APPROVE] writeContract result:', result)
    
    // result is a hash string (not an object with .hash property)
    const txHash = result as string
    
    if (!txHash || typeof txHash !== 'string') {
      throw new Error('Transaction hash is undefined. Check wallet connection and chain ID.')
    }
    
    await guardedWait({ hash: txHash as `0x${string}`, pollingInterval: 1000 })

    // Wait a bit for state to propagate on all nodes
    console.log('[APPROVE] Waiting for state to propagate...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Onayı tekrar oku
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [ownerAddr, CORE_ADDRESS],
    })
    
    console.log('[APPROVE DONE] Final allowance:', allowance.toString())
    
    // CRITICAL: Verify the contract can actually see this allowance
    console.log('[VERIFY] Reading allowance FROM THE CONTRACT PERSPECTIVE...')
    console.log('[VERIFY] Args:', { owner: ownerAddr, spender: CORE_ADDRESS, token: USDC_ADDRESS })
    
    // Try reading from Core's perspective (simulate what Core will see)
    const fromCorePerspective = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [ownerAddr, CORE_ADDRESS]
    }) as bigint
    
    console.log('[VERIFY] Allowance as seen by contract:', fromCorePerspective.toString())
    
    if (fromCorePerspective === 0n) {
      console.error('❌ CRITICAL: Allowance is still 0 after approval!')
      console.error('This means the approve transaction did not actually write to the blockchain')
      throw new Error('Approval failed - allowance still 0 after transaction')
    }
    
    return allowance
  } catch (error: any) {
    console.error('[APPROVE ERROR]', error)
    throw error
  }
}
