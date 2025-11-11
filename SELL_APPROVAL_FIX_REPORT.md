# SELL Approval Döngüsü Düzeltme Raporu

## Özet

Sell akışındaki approval döngüsü düzeltildi. Artık UI, token'ın permit destekleyip desteklemediğini kontrol ediyor ve buna göre approve veya permit akışını kullanıyor.

## Değişen Dosyalar

### 1. `app/api/trade/quote/route.ts`

**Değişiklikler:**
- Sell modu için token allowance kontrolü eklendi
- `checkPermitSupport()` fonksiyonu eklendi (token'ın EIP-2612 permit destekleyip desteklemediğini kontrol eder)
- Response'a yeni field'lar eklendi:
  - `supportsPermit: boolean` - Token permit destekliyor mu? (default: false)
  - `needsApproval: boolean` - Approval gerekiyor mu?
  - `tokenBalance: string` - Kullanıcının token bakiyesi (sell için)
  - `tokenAllowance: string` - Kullanıcının token allowance'ı (sell için)

**Eklenen Kod:**
```typescript
// Check if token supports EIP-2612 permit
async function checkPermitSupport(tokenAddress: `0x${string}`): Promise<boolean> {
  try {
    // Try to read nonces() - if it exists, token likely supports permit
    await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_PERMIT_ABI,
      functionName: 'nonces',
      args: ['0x0000000000000000000000000000000000000000' as `0x${string}`]
    })
    return true
  } catch {
    return false
  }
}
```

**Response Örneği (SELL):**
```json
{
  "ok": true,
  "price8": "500000000",
  "usdcTotal": "5000000",
  "slippageMax": "5000000",
  "userUsdcBal": "10000000",
  "needApproval": true,
  "allowanceShortage": true,
  "supportsPermit": false,
  "needsApproval": true,
  "tokenBalance": "1000000000000000000",
  "tokenAllowance": "0"
}
```

### 2. `app/market/page.tsx`

**Değişiklikler:**

#### a) `handleSell()` fonksiyonu:
- Token allowance ve permit support kontrolü eklendi
- `modalQuote`'ya yeni field'lar eklendi:
  - `tokenAddress: string` - Token adresi
  - `supportsPermit: boolean` - Permit desteği
  - `needsApproval: boolean` - Approval gereksinimi

#### b) `handleModalApprove()` fonksiyonu:
- **ESKİ:** SELL için "SELL does not require manual approval. Use permit signature instead." hatası fırlatıyordu
- **YENİ:** 
  - Eğer `supportsPermit === false` ise, token için `approve(spender, MAX_UINT256)` çağrısı yapıyor
  - Approve başarılı olduktan sonra allowance'ı verify ediyor
  - Eğer `supportsPermit === true` ise, approve atlanıyor (permit kullanılacak)

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
    
    // Wait for confirmation and verify
    await guardedWait({ hash: approveHash, pollingInterval: 1000 })
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
- **ESKİ:** Permit zorunluydu, desteklenmiyorsa hata gösteriyordu
- **YENİ:**
  - `supportsPermit` kontrolü eklendi
  - Eğer `supportsPermit === true` ve allowance yetersizse → `sellWithPermit` kullanılıyor
  - Eğer `supportsPermit === false` ve allowance yetersizse → Kullanıcıya approve butonu gösteriliyor (handleModalApprove'da işleniyor)
  - Eğer allowance yeterliyse → Standart `sell()` kullanılıyor

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
    // If we reach here, it means approval was skipped - show error
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

#### a) Approval mesajı:
- **ESKİ:** "First-time approval required. This is a one-time permission for all trades."
- **YENİ:** 
  - BUY için: "First-time approval required. This is a one-time permission for all trades."
  - SELL için (permit desteklenmiyorsa): "This token does not support permit. Please approve once, then sell."
  - SELL için (permit destekleniyorsa): "First-time approval required. This is a one-time permission for all trades."

**Değişen Kod:**
```typescript
{mode === 'buy' 
  ? 'ℹ️ First-time approval required. This is a one-time permission for all trades.'
  : (quote as any)?.supportsPermit === false
    ? 'ℹ️ This token does not support permit. Please approve once, then sell.'
    : 'ℹ️ First-time approval required. This is a one-time permission for all trades.'
}
```

#### b) Approve butonu metni:
- **ESKİ:** "Approve USDC" (her zaman)
- **YENİ:**
  - BUY için: "Approve USDC"
  - SELL için: "Approve Token"

**Değişen Kod:**
```typescript
{pending 
  ? 'Approving...' 
  : mode === 'buy' 
    ? 'Approve USDC' 
    : 'Approve Token'
}
```

## Yeni Field'lar

### Backend Response (`/api/trade/quote`)

**BUY için:**
```typescript
{
  ok: boolean
  price8: string
  usdcTotal: string
  slippageMax: string
  userUsdcBal: string
  needApproval: boolean
  allowanceShortage: boolean
  supportsPermit: false  // BUY için her zaman false
  needsApproval: boolean
}
```

**SELL için:**
```typescript
{
  ok: boolean
  price8: string
  usdcTotal: string
  slippageMax: string
  userUsdcBal: string
  needApproval: boolean  // supportsPermit === false && needsApproval === true ise true
  allowanceShortage: boolean
  supportsPermit: boolean  // Token permit destekliyor mu?
  needsApproval: boolean   // Approval gerekiyor mu?
  tokenBalance: string     // Kullanıcının token bakiyesi
  tokenAllowance: string   // Kullanıcının token allowance'ı
}
```

### Frontend State (`modalQuote`)

```typescript
{
  usdcTotal: bigint
  userUsdcBal: bigint
  needApproval: boolean
  allowance?: bigint
  amountToken?: string
  countryName?: string
  tokenAddress?: string      // YENİ: Token adresi (SELL için)
  supportsPermit?: boolean   // YENİ: Permit desteği (SELL için)
  needsApproval?: boolean    // YENİ: Approval gereksinimi (SELL için)
}
```

## Kullanıcıya Gösterilen Mesajlar

### 1. Approval Gerekli Mesajı

**BUY için:**
```
ℹ️ First-time approval required. This is a one-time permission for all trades.
```

**SELL için (permit desteklenmiyorsa):**
```
ℹ️ This token does not support permit. Please approve once, then sell.
```

**SELL için (permit destekleniyorsa):**
```
ℹ️ First-time approval required. This is a one-time permission for all trades.
```

### 2. Approve Butonu Metni

**BUY için:**
```
Approve USDC
```

**SELL için:**
```
Approve Token
```

## Akış Diyagramı

### SELL Akışı (Yeni)

```
1. Kullanıcı "Sell" butonuna tıklar
   ↓
2. handleSell() çağrılır
   - Token allowance kontrol edilir
   - Permit desteği kontrol edilir (nonces() çağrısı)
   - modalQuote oluşturulur (supportsPermit, needsApproval, tokenAddress ile)
   ↓
3. Modal açılır
   ↓
4. Eğer needsApproval === true:
   a) supportsPermit === false:
      - "This token does not support permit. Please approve once, then sell." mesajı gösterilir
      - "Approve Token" butonu gösterilir
      - Kullanıcı "Approve Token" butonuna tıklar
      - handleModalApprove() çağrılır
      - approve(spender, MAX_UINT256) çağrısı yapılır
      - Allowance verify edilir
      - Başarılı olursa, "Sell" butonu aktif olur
   
   b) supportsPermit === true:
      - Permit kullanılacak, approve gerekmez
      - "Sell" butonu direkt aktif olur
   ↓
5. Kullanıcı "Sell" butonuna tıklar
   ↓
6. handleModalConfirm() çağrılır
   - Token allowance tekrar kontrol edilir
   - Eğer allowance yetersizse:
     a) supportsPermit === true:
        - sellWithPermit() kullanılır (permit signature ile)
     b) supportsPermit === false:
        - Hata gösterilir: "This token does not support permit. Please approve once and retry."
   - Eğer allowance yeterliyse:
     - Standart sell() kullanılır
```

## Test Senaryoları

### Senaryo 1: Permit Desteklenmeyen Token (FlagWarsToken)
1. Kullanıcı sell yapmak istiyor
2. Token permit desteklemiyor (nonces() çağrısı başarısız)
3. UI "This token does not support permit. Please approve once, then sell." mesajını gösterir
4. Kullanıcı "Approve Token" butonuna tıklar
5. approve(spender, MAX_UINT256) çağrısı yapılır
6. Allowance verify edilir
7. "Sell" butonu aktif olur
8. Kullanıcı "Sell" butonuna tıklar
9. Standart sell() çağrısı yapılır

### Senaryo 2: Permit Destekleyen Token
1. Kullanıcı sell yapmak istiyor
2. Token permit destekliyor (nonces() çağrısı başarılı)
3. UI "Sell" butonunu direkt gösterir (approve gerekmez)
4. Kullanıcı "Sell" butonuna tıklar
5. Allowance yetersizse, sellWithPermit() kullanılır (permit signature ile)
6. Allowance yeterliyse, standart sell() kullanılır

### Senaryo 3: Zaten Approve Edilmiş Token
1. Kullanıcı sell yapmak istiyor
2. Token allowance yeterli
3. UI "Sell" butonunu direkt gösterir
4. Kullanıcı "Sell" butonuna tıklar
5. Standart sell() çağrısı yapılır

## Önemli Notlar

1. **Varsayılan Davranış:** Permit desteklenmiyor kabul edilir (default: false). Sadece açıkça `nonces()` çağrısı başarılı olursa permit destekleniyor kabul edilir.

2. **Backward Compatibility:** Eski token'lar (permit desteklemeyen) için approve akışı kullanılır. Yeni token'lar (permit destekleyen) için permit akışı kullanılır.

3. **Hata Yönetimi:** Eğer permit desteklenmiyorsa ve kullanıcı approve yapmadan sell yapmaya çalışırsa, açık bir hata mesajı gösterilir.

4. **Performans:** Permit desteği kontrolü sadece quote endpoint'inde yapılır, her sell işleminde tekrar kontrol edilmez.

## Sonuç

Sell akışındaki approval döngüsü düzeltildi. Artık:
- Permit desteklenmeyen token'lar için approve akışı kullanılıyor
- Permit destekleyen token'lar için permit akışı kullanılıyor
- Kullanıcıya açık ve anlaşılır mesajlar gösteriliyor
- Hiçbir durumda kullanıcı bloklanmıyor

