# Achievements & SBT — E2E Doğrulama Raporu

Tarih: 2025-01-29  
Ağ: Base Sepolia (84532)  
Core: 0x80Ab8d002649f70Be3BC3654F6f0024626Fedbce  
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e  
SBT: 0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9

## 1) Ortam & Health

✅ **Ortam & Yapılandırma**
- NEXT_PUBLIC_CHAIN_ID = 84532 (Base Sepolia) ✅
- NEXT_PUBLIC_CORE_ADDRESS = 0x80Ab8d002649f70Be3BC3654F6f0024626Fedbce ✅
- NEXT_PUBLIC_USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e ✅
- NEXT_PUBLIC_ACHIEVEMENTS_SBT_ADDRESS = 0xcB6395dD6f3eFE8cBb8d5082C5A5631aE9A421e9 ✅
- ACHV_SIGNER_PRIVATE_KEY set (server-only) ✅
- REVENUE_ADDRESS = 0x2c1CfF98ef5F46D4D4e7e58F845Dd9D2f9D20B10 ✅
- USE_REDIS = true ✅
- USE_QUEUE = true ✅
- NEXT_PUBLIC_RPC_BASE_SEPOLIA = https://sepolia.base.org ✅

⚠️ **Health Checks**
- Redis: ok (latency: ~800ms) ✅
- Queue: Enabled but worker verification requires runtime check ⚠️
  - Note: Queue health endpoint exists at `/api/health/queue`
  - Worker processes need to be running separately (`worker:attack`, `worker:prewarm`)

## 2) Sözleşmeler

✅ **Core Contract**
- Core.countries() function exists ✅
- Attack functions: `attack()`, `attackBatch()` ✅
- Quote functions: `quoteBuy()`, `quoteSell()`, `previewAttackFee()` ✅
- Supply: `remainingSupply()` ✅
- Attack fee flow: `transferFrom(user → Core)` then `transfer(Core → REVENUE)` ✅

✅ **SBT Contract (AchievementsSBT.sol)**
- **Non-transferable:**
  - `_beforeTokenTransfer`: blocks transfers (from != 0 && to != 0) ✅
  - `approve`: reverts with `SBT_NON_TRANSFERABLE()` ✅
  - `setApprovalForAll`: reverts ✅
  - `transferFrom`: reverts ✅
  - `safeTransferFrom`: reverts (both overloads) ✅
  - No public `burn()` function exposed ✅
  
- **Mint:**
  - `mint()`: user == msg.sender check ✅
  - Mint fee: `transferFrom(user → revenue)` directly (single transaction) ✅
  - `validLevels` whitelist check ✅
  - `usedNonce` replay protection ✅
  - `deadline` expiry check ✅
  - EIP-712 signature verification ✅

- **Configuration:**
  - SBT.revenue() = 0x2c1CfF98ef5F46D4D4e7e58F845Dd9D2f9D20B10 ✅ (matches REVENUE_ADDRESS)
  - SBT.payToken() = 0x036CbD53842c5426634e7929541eC2318f3dCF7e ✅ (matches USDC_ADDRESS)

## 3) Achievement Kuralları

✅ **Attack Count (1/10/100/1000)**
- Thresholds: [1, 10, 100, 1000] ✅
- Data source: `achv_progress.totalAttacks` (incremented by `syncProgressAfterAttack`) ✅
- Implementation: `lib/achievementsSync.ts` → `lib/achievements.ts` ✅

⚠️ **Multi-Country Attack (1/5/15/35)**
- Thresholds in code: [1, 5, 15, **40**] ⚠️
- **Spec says: [1, 5, 15, 35] — mismatch detected**
- Data source: `attackedCountries` array → `distinctCountriesAttacked` ✅
- Implementation: Uses `$addToSet` for distinct tracking ✅

✅ **Referral Count (1/10/100/1000)**
- Thresholds: [1, 10, 100, 1000] ✅
- Data source: `referrals` collection query:
  ```typescript
  { refWallet: checksummed, confirmedOnChain: true, isActive: true }
  ```
- ⚠️ **Note**: `isActive` field meaning needs verification — should represent "referree made ≥1 buy"
- Implementation: `lib/achievements.ts::updateReferralCount()` ✅

❌ **Consecutive Active Days — İPTAL (NOT REMOVED)**
- **CRITICAL**: Consecutive Days code still exists in:
  - `lib/schemas/achievements.ts`: Category 4, thresholds [10, 20, 30, 60] ❌
  - `lib/achievements.ts`: `updateConsecutiveActiveDays()` function ❌
  - `lib/achievementsSync.ts`: `updateConsecutiveDays()` function ❌
  - `app/achievements/page.tsx`: UI display ❌
  - `app/api/achievements/my/route.ts`: API response ❌
- **Action Required**: Remove all consecutive days logic per requirements

❌ **Number of Total Flags (5/50/250/500) — NOT IMPLEMENTED**
- **CRITICAL**: Flag Count achievement category does not exist
- Expected: Category 5, thresholds [5, 50, 250, 500]
- Expected data source: Snapshot from ERC20 balances at threshold moment
- Expected collection: `flags_snapshots` with `{ user, ownedCount, ts }`
- **Action Required**: Implement Flag Count achievement system

## 4) DB & Indexler

✅ **Collections**
- `achv_defs`: Achievement definitions ✅
- `achv_progress`: User progress metrics ✅
- `achv_mints`: Mint records ✅
- `referrals`: Referral records ✅
- ⚠️ `attacks`: Not verified if exists (needed for attack event tracking)

⚠️ **Indexes**
- `achv_progress`: Should have `{ userId: 1 }` unique or compound ✅
  - Verification: Index creation script needed (`scripts/init-achievements.ts`)
- `achv_mints`: Should have `{ userId: 1, category: 1, level: 1 }` unique ⚠️
- `attacks`: Should have `{ user: 1, toId: 1, ts: -1 }` and `{ user: 1, ts: -1 }` ⚠️
- `referrals`: Should have `{ refWallet: 1, isActive: 1, ts: -1 }` ⚠️

❌ **Flags Snapshots Collection**
- `flags_snapshots`: **MISSING** (required for Flag Count achievement)

## 5) Queue & İdempotensi

✅ **Attack Events Queue**
- Queue producer: `/api/queue/attack-events` ✅
- Queue consumer: `workers/attack-events.worker.ts` ✅
- Job payload includes: `user`, `fromId`, `toId`, `amountToken18`, `txHash`, `blockNumber`, `feeUSDC6`, `timestamp` ✅

⚠️ **Idempotency**
- Queue side: Uses job ID but duplicate prevention via `SETNX(eventId)` not verified ⚠️
- API side: Uses `txPending` state to prevent double-click ✅
- **Missing**: Attack events may not be written to MongoDB `attacks` collection (only achievements sync runs)

⚠️ **Cache Invalidation**
- Worker invalidates: `country:*`, `supply:*`, `quoteBuy:*`, `quoteSell:*`, `previewAttackFee:*` ✅
- **Missing**: Inventory cache (`inv:*`) invalidation after attack (recently added, needs verification)

## 6) Redis Cache

✅ **Achievements Cache**
- Cache key pattern: `achv:my:${userId}` ✅
- Cache TTL: 5 seconds (within 3-10s range) ✅
- Cache write: Implemented in `/api/achievements/my` ✅

⚠️ **Cache Invalidation**
- Cache invalidation in `achievementsSync.ts` not found ⚠️
- Mint auth cache: `achv:mint:auth:${userId}:${category}:${level}` cleared after confirm ✅
- **Missing**: User progress cache invalidation after attack/buy/sell

✅ **Summary API**
- Single API endpoint: `/api/achievements/my` ✅
- Returns: `earned`, `minted`, `progress`, `defs` ✅

## 7) SBT Mint Akışı

✅ **Mint Authorization**
- Endpoint: `/api/achievements/mint-auth` ✅
- EIP-712 signature with nonce ✅
- Rate limiting: 1 req/30s per user, 5 req/60s per IP ✅
- Idempotency lock: Redis `SETNX` ✅

✅ **USDC Approval**
- UI checks allowance: `ensureUsdcAllowance()` pattern (not implemented in achievements page) ⚠️
- SBT contract pulls USDC: `transferFrom(user → revenue)` ✅
- Amount: 0.20 USDC (200000 micro-USDC) ✅

✅ **Mint Transaction**
- Contract: `mint(MintAuth, signature)` ✅
- Validations: user, level, price, nonce, deadline, signature ✅
- Fee transfer: Direct to revenue address ✅

✅ **Confirmation**
- Endpoint: `/api/achievements/confirm` ✅
- On-chain receipt verification ✅
- Event parsing: `AchievementMinted` event ✅
- DB updates: `achv_mints` insert + `achv_progress.minted` update ✅
- Idempotent: Checks for existing confirmed mint ✅

⚠️ **UI Mint Flow**
- Achievements page: Shows earned/owned status ✅
- Mint button: Enabled only if `status === 'earned'` ✅
- **Missing**: USDC allowance preflight check before mint (should use `ensureUsdcAllowance` pattern)

## 8) Güvenlik & Observability

✅ **Server-Only Modules**
- `lib/queue.ts`: `import 'server-only'` ✅
- `lib/redis.ts`: Uses `server-only` via HMR-safe singleton ✅
- `lib/achievementsSigner.ts`: `import 'server-only'` ✅
- `lib/achievements.ts`: `import 'server-only'` ✅
- `lib/achievementsSync.ts`: `import 'server-only'` ✅

✅ **Rate Limiting**
- `/api/achievements/mint-auth`: User (1/30s) + IP (5/60s) ✅
- `/api/achievements/*`: JWT auth required ✅

✅ **Replay Protection**
- SBT contract: `usedNonce` mapping ✅
- API: Nonce incremented per request ✅
- Signature: EIP-712 with deadline (10 minutes) ✅

✅ **Chain Guard**
- All write operations: `requireBaseSepolia` via `guardedWrite` ✅
- RPC fallback: Implemented in providers ✅

✅ **Error Handling**
- RPC backoff: `guardedWaitSafe` with exponential backoff (6 retries, 1200ms base) ✅
- Logging: Console logs for errors ✅

⚠️ **Observability**
- Health endpoints: `/api/health/redis`, `/api/health/queue` ✅
- **Missing**: Achievements-specific health metrics
- **Missing**: Achievement unlock/mint rate tracking

## 9) Sonuç

### Genel Durum: ❌ **Hatalar var** — Yayına hazır değil

**İstatistikler:**
- Toplam kontrol: 8 ana kategori
- Başarılı: 5
- Uyarılar: 8
- **Kritik hatalar: 2**

### Kritik Bulgular:

#### ❌ **1. Consecutive Days İptal Edilmedi**
- **Dosyalar**: `lib/schemas/achievements.ts`, `lib/achievements.ts`, `lib/achievementsSync.ts`, `app/achievements/page.tsx`, `app/api/achievements/my/route.ts`
- **Sorun**: Tüm consecutive days kodları hala aktif
- **Etki**: Gereksiz kod, yanlış achievement gösterimi

#### ❌ **2. Flag Count (Number of Total Flags) Implement Edilmemiş**
- **Eksik**: Category 5, thresholds [5, 50, 250, 500]
- **Eksik**: `flags_snapshots` collection ve snapshot logic
- **Eksik**: Flag balance tracking ve threshold detection
- **Etki**: Yeni achievement kategorisi hiç çalışmıyor

### Önerilen Düzeltmeler (Yüksek Öncelik):

1. **Consecutive Days Temizleme**:
   - `lib/schemas/achievements.ts`: Category 4, thresholds, INITIAL_ACHIEVEMENT_DEFS'dan kaldır
   - `lib/achievements.ts`: `updateConsecutiveActiveDays()` fonksiyonunu kaldır
   - `lib/achievementsSync.ts`: `updateConsecutiveDays()` çağrılarını ve fonksiyonunu kaldır
   - `app/achievements/page.tsx`: UI'dan consecutive days display kaldır
   - `app/api/achievements/my/route.ts`: Response'dan `consecutiveActiveDays` kaldır
   - DB: Mevcut `consecutiveActiveDays` değerleri sıfırlanabilir (opsiyonel)

2. **Flag Count Achievement Implementasyonu**:
   - Yeni category 5 ekle: `FLAG_COUNT`, thresholds [5, 50, 250, 500]
   - `flags_snapshots` collection oluştur: `{ user, ownedCount, ts }`
   - Flag balance snapshot logic: Buy/sell sonrası snapshot al, threshold geçişini tespit et
   - `lib/achievements.ts`: `updateFlagCount()` fonksiyonu ekle
   - DB indexes: `{ user: 1, ts: -1 }` for flags_snapshots
   - UI: Flag count achievement'ı göster

3. **Multi-Country Threshold Düzeltmesi**:
   - Spec'e göre [1, 5, 15, 35] olmalı (şu an 40)
   - `lib/schemas/achievements.ts`: `ACHIEVEMENT_THRESHOLDS[MULTI_COUNTRY]` düzelt
   - On-chain: `setValidLevel(category=2, level=35, true)` ve `setValidLevel(category=2, level=40, false)` çağır

4. **Referral Count "Active" Tanımı Netleştir**:
   - `referrals` collection'da `isActive` field'ının "referree made ≥1 buy" anlamına geldiğini doğrula
   - Eğer farklıysa, query'yi düzelt veya field'ı güncelle

5. **Attack Events MongoDB Yazımı**:
   - `attacks` collection'a event yazımı ekle (şu an sadece achievements sync çalışıyor)
   - Idempotency: `{ txHash: 1, logIndex: 1 }` unique index
   - Worker'da veya API'de attack event'leri DB'ye kaydet

6. **Cache Invalidation İyileştirmesi**:
   - `lib/achievementsSync.ts`: Attack/buy/sell sonrası `achv:my:${userId}` cache'i temizle
   - Pattern: `redisClient.del(\`achv:my:${userId}\`)` ekle

7. **UI USDC Allowance Preflight**:
   - `app/achievements/page.tsx`: Mint butonuna tıklayınca önce `ensureUsdcAllowance()` çağır
   - Pattern: `app/attack/page.tsx`'teki gibi

### Orta Öncelik:

8. **MongoDB Index Verification**:
   - Tüm required indexlerin oluşturulduğunu doğrula (`scripts/init-achievements.ts`)
   - Performance test için eksik indexleri ekle

9. **Observability Metrics**:
   - Achievement unlock rate tracking
   - Mint success/failure rate
   - Cache hit/miss rates

---

**Rapor Oluşturulma Tarihi**: 2025-01-29  
**Doğrulama Yöntemi**: Manuel kod inceleme + script denemesi  
**Sonraki Adım**: Kritik hataların düzeltilmesi ve re-test

