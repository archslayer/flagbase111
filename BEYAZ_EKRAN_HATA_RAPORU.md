# Beyaz Ekran Hatası - Son Değişiklikler Raporu

## Sorun
Market sayfası beyaz ekran veriyor. Son düzenlemelerden önce bu sorun yoktu.

## Son Yapılan Değişiklikler

### 1. `app/api/trade/quote/route.ts`
**Değişiklikler:**
- Sell modu için token allowance kontrolü eklendi
- `checkPermitSupport()` fonksiyonu eklendi
- Response'a yeni field'lar eklendi: `supportsPermit`, `needsApproval`, `tokenBalance`, `tokenAllowance`
- **SORUN:** Top-level'da `createPublicClient` oluşturuluyordu (build/static generation sırasında sorun çıkarabilir)
- **DÜZELTME:** `createPublicClient` fonksiyon içine taşındı
- **DÜZELTME:** `export const dynamic = 'force-dynamic'` eklendi

**Değişen Kod:**
```typescript
// ÖNCE (SORUNLU):
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org')
})

// SONRA (DÜZELTME):
export const dynamic = 'force-dynamic'

async function checkPermitSupport(tokenAddress: `0x${string}`): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org')
    })
    // ... rest of the code
  }
}

// SELL modunda da publicClient fonksiyon içinde oluşturuluyor
```

### 2. `app/market/page.tsx`
**Değişiklikler:**

#### a) `handleSell()` fonksiyonu:
- Token allowance ve permit support kontrolü eklendi
- `modalQuote`'ya yeni field'lar eklendi: `tokenAddress`, `supportsPermit`, `needsApproval`
- **POTANSİYEL SORUN:** `intTokensToWei(sellAmount)` çağrısı hata fırlatabilir
- **POTANSİYEL SORUN:** `supportsPermit` kontrolü async ve hata durumunda `modalQuote` düzgün set edilmeyebilir

**Eklenen Kod:**
```typescript
// Get token allowance and check permit support if we have token address
let tokenAllowance = 0n
let supportsPermit = false
if (address && tokenAddr) {
  try {
    [tokenAllowance, supportsPermit] = await Promise.all([
      pub.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
      }) as Promise<bigint>,
      // Check permit support by trying to read nonces
      (async () => {
        try {
          await pub.readContract({
            address: tokenAddr,
            abi: parseAbi(['function nonces(address) view returns (uint256)']),
            functionName: 'nonces',
            args: [address as `0x${string}`]
          })
          return true
        } catch {
          return false
        }
      })()
    ])
  } catch (e) {
    console.error('[SELL] Error reading token allowance or permit support:', e)
  }
}

// Now open modal with all data ready
if (!tokenAddr) {
  toast.push({ text: 'Token address not found', type: 'error' })
  return
}

const amountWei = intTokensToWei(sellAmount)
const needsApproval = tokenAllowance < amountWei && !supportsPermit
setModalQuote({
  usdcTotal: netUSDC6,
  userUsdcBal,
  needApproval: needsApproval,
  allowance: tokenAllowance,
  amountToken: sellAmount,
  countryName: selected.name,
  tokenAddress: tokenAddr,
  supportsPermit,
  needsApproval
} as any)
```

#### b) `handleModalApprove()` fonksiyonu:
- SELL için token approve işlemi eklendi
- **POTANSİYEL SORUN:** `modalQuote?.supportsPermit` kontrolü yapılıyor ama `modalQuote` null olabilir
- **POTANSİYEL SORUN:** `tokenAddress` undefined olabilir

**Eklenen Kod:**
```typescript
} else {
  // SELL: Approve country token if needed
  if (!modalQuote?.supportsPermit) {
    // Token does not support permit - use classic approve
    console.log('🔍 [APPROVE MODAL] Starting token approval for SELL...')
    const tokenAddr = (modalQuote as any)?.tokenAddress as `0x${string}` | undefined
    
    if (!tokenAddr) {
      throw new Error('Token address not found in quote')
    }
    
    // Approve token
    const approveHash = await guardedWrite({
      address: tokenAddr,
      abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
      functionName: 'approve',
      args: [CORE_ADDRESS as `0x${string}`, maxUint256],
      chainId: 84532
    })
    
    // Wait for confirmation
    await waitReceiptSafe(approveHash, { confirmations: 1, timeout: 60_000, pollingInterval: 1000 })
    
    // Verify allowance
    const verifyAllowance = await pub.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address as `0x${string}`, CORE_ADDRESS as `0x${string}`]
    })
    
    newAllowance = verifyAllowance
    toast.push({ text: 'Token approved', type: 'success' })
  } else {
    // Token supports permit - no approval needed
    console.log('✅ [APPROVE MODAL] Token supports permit, no approval needed')
    newAllowance = maxUint256 // Dummy value, permit will be used
  }
}
```

#### c) `handleModalConfirm()` fonksiyonu:
- Permit zorunluluğu kaldırıldı, `supportsPermit` kontrolü eklendi
- **POTANSİYEL SORUN:** `modalQuote?.supportsPermit` kontrolü yapılıyor ama `modalQuote` null olabilir

**Değişen Kod:**
```typescript
const supportsPermit = modalQuote?.supportsPermit ?? false

if (tokenAllowance < amt18) {
  // Insufficient allowance
  if (supportsPermit) {
    // Token supports permit - use sellWithPermit
    // ... permit signature logic ...
  } else {
    // Token does not support permit - should have been approved in handleModalApprove
    setModalPending(false)
    setModalStatus(undefined)
    setModalError('This token does not support permit. Please approve once and retry.')
    setModalQuote((q: any) => q ? { ...q, needApproval: true, supportsPermit: false } : q)
    return
  }
} else {
  // Allowance sufficient - use standard sell
  txHash = await guardedWrite({
    address: CORE_ADDRESS as `0x${string}`,
    abi: CORE_ABI,
    functionName: 'sell',
    args: [BigInt(selected!.id), amt18, calcMinOut(modalQuote!.usdcTotal), deadline],
    chainId: 84532
  })
}
```

### 3. `components/ConfirmTradeModal.tsx`
**Değişiklikler:**
- Approval mesajları güncellendi (SELL için özel mesaj)
- Approve butonu metni güncellendi ("Approve Token" SELL için)
- **POTANSİYEL SORUN:** `(quote as any)?.supportsPermit` kontrolü yapılıyor ama `quote` undefined olabilir

**Değişen Kod:**
```typescript
{mode === 'buy' 
  ? 'ℹ️ First-time approval required. This is a one-time permission for all trades.'
  : (quote as any)?.supportsPermit === false
    ? 'ℹ️ This token does not support permit. Please approve once, then sell.'
    : 'ℹ️ First-time approval required. This is a one-time permission for all trades.'
}
```

## Muhtemel Sorunlar

### 1. API Route'ta Top-Level `createPublicClient`
**Sorun:** `app/api/trade/quote/route.ts` dosyasında top-level'da `createPublicClient` oluşturuluyordu. Bu, Next.js build/static generation sırasında sorun çıkarabilir.

**Çözüm:** `createPublicClient` fonksiyon içine taşındı ve `export const dynamic = 'force-dynamic'` eklendi.

### 2. Client-Side'da Top-Level `pub` Client
**Sorun:** `app/market/page.tsx` dosyasında top-level'da `pub` client'ı oluşturuluyor. Bu, client-side'da çalışabilir ama `process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA` build zamanında undefined olabilir.

**Durum:** Bu zaten mevcut kodda vardı, yeni eklenmedi. Ama kontrol edilmeli.

### 3. `handleSell` İçinde Hata Yönetimi
**Sorun:** `handleSell` içinde `intTokensToWei(sellAmount)` çağrısı hata fırlatabilir. Eğer `sellAmount` geçersiz bir değerse (örneğin boş string veya "0"), bu bir hata fırlatabilir.

**Durum:** `handleSell` başında `!sellAmount || sellAmount === '0'` kontrolü var, bu yeterli olmalı.

### 4. `modalQuote` Null Check'leri
**Sorun:** `handleModalApprove` ve `handleModalConfirm` içinde `modalQuote?.supportsPermit` kontrolü yapılıyor ama `modalQuote` null olabilir.

**Durum:** `modalQuote?.supportsPermit` optional chaining kullanıyor, bu güvenli olmalı.

### 5. `ConfirmTradeModal` İçinde `quote` Undefined
**Sorun:** `ConfirmTradeModal` içinde `(quote as any)?.supportsPermit` kontrolü yapılıyor ama `quote` undefined olabilir.

**Durum:** `quote?` optional chaining kullanılıyor, bu güvenli olmalı.

## Yapılan Düzeltmeler

1. ✅ `app/api/trade/quote/route.ts` - Top-level `createPublicClient` fonksiyon içine taşındı
2. ✅ `app/api/trade/quote/route.ts` - `export const dynamic = 'force-dynamic'` eklendi
3. ✅ `app/market/page.tsx` - `handleSell` içinde `tokenAddr` null check eklendi
4. ✅ `app/market/page.tsx` - `handleModalApprove` içinde `guardedWait` -> `waitReceiptSafe` değiştirildi
5. ✅ `app/market/page.tsx` - `amountWei` hesaplaması ayrı değişkene alındı

## Test Edilmesi Gerekenler

1. Market sayfası açılıyor mu?
2. Sell butonuna tıklanınca modal açılıyor mu?
3. Approve butonu görünüyor mu?
4. Approve işlemi çalışıyor mu?
5. Sell işlemi çalışıyor mu?

## Sonraki Adımlar

1. Dev server'ı yeniden başlatın: `pnpm dev`
2. Browser console'u açın (F12) ve hata mesajlarını kontrol edin
3. Eğer hala beyaz ekran görüyorsanız, console'daki hata mesajını paylaşın

