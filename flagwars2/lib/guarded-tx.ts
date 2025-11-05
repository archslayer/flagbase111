import { writeContract, readContract, waitForTransactionReceipt, getChainId } from 'wagmi/actions'
import { config } from '@/app/providers'
import { requireBaseSepolia } from './chain-guard'
import { BASE_SEPOLIA_ID } from './chains'

export async function guardedWrite(args: Parameters<typeof writeContract>[1]) {
  // Ağ kontrolü - yanlış ağdaysa hata fırlatır
  await requireBaseSepolia()
  
  // Double-check: Transaction'dan hemen önce son kontrol
  const finalChainId = getChainId(config)
  if (finalChainId !== BASE_SEPOLIA_ID) {
    throw new Error(
      `⚠️ Ağ değişti!\n\n` +
      `Transaction iptal edildi.\n` +
      `Lütfen Base Sepolia (${BASE_SEPOLIA_ID}) ağında kalın.\n\n` +
      `Şu an: ${finalChainId}`
    )
  }
  
  // Artık eminiz - Base Sepolia'dayız
  return writeContract(config, args)
}

export async function guardedRead(args: Parameters<typeof readContract>[1]) {
  await requireBaseSepolia()
  return readContract(config, args)
}

export async function guardedWait(args: Parameters<typeof waitForTransactionReceipt>[1]) {
  // NO GUARD HERE! Transaction already sent, just wait for receipt
  // Chain guard should only be done before writeContract, not after
  return waitForTransactionReceipt(config, args)
}

/**
 * Safe wrapper around waitForTransactionReceipt that retries on RPC "block not found" errors
 * with exponential backoff + jitter for high-concurrency scenarios
 */
export async function guardedWaitSafe(args: Parameters<typeof waitForTransactionReceipt>[1]) {
  let retries = 0
  const maxRetries = 6 // Increased for 1000 concurrent attacks
  const base = 1200    // Base delay in ms
  
  while (true) {
    try {
      console.log(`[SAFE WAIT] Attempt ${retries + 1}/${maxRetries} for tx ${args.hash}`)
      const receipt = await waitForTransactionReceipt(config, args)
      console.log('[SAFE WAIT] ✅ Receipt:', receipt.status, 'bn=', receipt.blockNumber)
      return receipt
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase()
      const isBlockNotFound = msg.includes('requested resource not found') ||
                              msg.includes('block not found') ||
                              msg.includes('resource not found')

      if (isBlockNotFound && retries < maxRetries - 1) {
        // Exponential backoff: 1.2s, 2.4s, 4.8s, 9.6s, 19.2s, 38.4s
        const jitter = Math.floor(Math.random() * 600) // 0-600ms random jitter
        const backoff = base * Math.pow(2, retries) + jitter
        console.warn(`[SAFE WAIT] ⚠️ Block not found; retry in ${backoff}ms`)
        await new Promise(res => setTimeout(res, backoff))
        retries++
        continue
      }

      console.error('[SAFE WAIT] ❌ Final fail:', err.shortMessage || err.message)
      throw err
    }
  }
}

