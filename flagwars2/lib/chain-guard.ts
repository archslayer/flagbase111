import { getChainId, switchChain } from 'wagmi/actions'
import { config } from '@/app/providers'
import { 
  BASE_SEPOLIA_ID, BASE_SEPOLIA_HEX, BASE_SEPOLIA_NAME, BASE_SEPOLIA_RPC, BASESCAN 
} from './chains'

export async function requireBaseSepolia() {
  // 1) Mevcut chain ID'yi kontrol et
  let currentChainId: number
  try {
    currentChainId = getChainId(config)
    console.log('[CHAIN-GUARD] Current chain:', currentChainId, 'Expected:', BASE_SEPOLIA_ID)
  } catch (err) {
    throw new Error('Cüzdan bağlantısı alınamadı. Lütfen cüzdanınızı bağlayın.')
  }

  // Zaten doğru ağdaysa çık
  if (currentChainId === BASE_SEPOLIA_ID) {
    console.log('[CHAIN-GUARD] ✅ Already on Base Sepolia, proceeding...')
    return
  }
  
  // YANLIŞ AĞDA - Kullanıcıya açık hata mesajı göster
  console.log('[CHAIN-GUARD] ❌ Wrong network detected!')
  throw new Error(
    `Yanlış ağdasınız!\n\n` +
    `Şu an: ${getNetworkName(currentChainId)}\n` +
    `Gerekli: Base Sepolia (${BASE_SEPOLIA_ID})\n\n` +
    `Lütfen cüzdanınızdan Base Sepolia ağına geçin.`
  )
}

// Helper function
function getNetworkName(chainId: number): string {
  const names: Record<number, string> = {
    1: 'Ethereum Mainnet',
    84532: 'Base Sepolia',
    8453: 'Base Mainnet',
    11155111: 'Sepolia',
    137: 'Polygon',
  }
  return names[chainId] || `Chain ${chainId}`
}

