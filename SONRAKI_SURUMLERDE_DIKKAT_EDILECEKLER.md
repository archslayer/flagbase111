# Sonraki Sürümlerde Dikkat Edilecekler

## 🎯 Temel Kural: Build-First Development

**"Dev değil, build'le gidelim"** prensibi artık projenin temel kuralı.

### ✅ Her Değişiklik Sonrası İş Akışı

1. **Bir dosyada değişiklik yap**
2. **`pnpm build` çalıştır**
3. **Hata yoksa commit**

Bu kural, production'da çalışmayan kodun git'e girmesini engeller.

---

## 📋 Kritik Dosyalar (Değiştirirken Dikkat!)

### 1. `app/api/auth/verify/route.ts`

**Neden Kritik:** `req.ip` hatası burada yaşandı. NextRequest'te `req.ip` yok!

**Dikkat Edilecekler:**
- ❌ **ASLA:** `req.ip` kullanma
- ✅ **HER ZAMAN:** IP'yi header'dan al:
  ```typescript
  const ip =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    'unknown'
  ```
- ✅ **KONTROL:** `NextRequest` tipini kullan (Request değil)

**Değiştirirsen:** Mutlaka `pnpm build` çalıştır ve IP alımını test et.

---

### 2. `app/api/countries/info/route.ts`

**Neden Kritik:** Contract'tan dönen değer **tuple**, object değil!

**Dikkat Edilecekler:**
- ❌ **ASLA:** `result.name`, `result.token` gibi property access kullanma
- ✅ **HER ZAMAN:** Tuple destructuring kullan:
  ```typescript
  const [name, tokenAddress, exists, price8, kappa8, lambda8, priceMin8] = result
  ```
- ✅ **KONTROL:** `countries()` fonksiyonu tuple döndürür: `[string, address, bool, bigint, number, number, bigint]`

**Değiştirirsen:** Mutlaka `pnpm build` çalıştır ve tuple yapısını doğrula.

---

### 3. `app/api/profile/inventory/route.ts`

**Neden Kritik:** 3 farklı yerde type assertion yapıldı. Kolay bozulur!

**Dikkat Edilecekler:**

#### 3.1. `result.result` unknown tipi (Satır ~130)
```typescript
// ❌ YANLIŞ
if (result.status === 'success' && result.result > 0n)

// ✅ DOĞRU
if (result.status === 'success' && (result.result as bigint) > 0n)
```

#### 3.2. `balance18` unknown tipi (Satır ~157)
```typescript
// ❌ YANLIŞ
const balance18 = balanceResult.result

// ✅ DOĞRU
const balance18 = balanceResult.result as bigint
```

#### 3.3. `amountToken18` string → bigint (Satır ~242)
```typescript
// ❌ YANLIŞ
amount = Number(formatUnits(balance.amountToken18, 18))

// ✅ DOĞRU
amount = Number(formatUnits(BigInt(balance.amountToken18), 18))
```

**Değiştirirsen:** 
- Mutlaka `pnpm build` çalıştır
- Bu 3 yerdeki type assertion'ları kontrol et
- MongoDB'den gelen `amountToken18` string olabilir, `BigInt()` ile çevir

---

### 4. `app/api/referral/preview/route.ts`

**Neden Kritik:** Bu route şu an minimal hâlde. İleride "gerçekten preview lazım" dersen üstüne yazılacak.

**Dikkat Edilecekler:**
- ✅ **ŞU AN:** Minimal response döndürüyor (build'i bloklamasın diye)
- ⚠️ **İLERİDE:** Gerçek preview özelliği eklenirse, `@/lib/referralRewards` modülü yok, o yüzden başka bir çözüm gerekir
- ✅ **KONTROL:** Gerçek referral akışı (`/api/referral/register`, `/api/referral/confirm`, `/api/referral/resolve`) olduğu gibi çalışıyor

**Değiştirirsen:**
- Mutlaka `pnpm build` çalıştır
- Eğer `@/lib/referralRewards` import edeceksen, önce o modülü oluştur

---

### 5. `tsconfig.json`

**Neden Kritik:** `scripts`, `tests`, `typechain-types`, `workers` exclude edildi. Bunu geri alırsan yine script hataları build'e akar!

**Dikkat Edilecekler:**
- ❌ **ASLA:** `exclude` listesinden `scripts`, `tests`, `typechain-types`, `workers` çıkarma
- ✅ **HER ZAMAN:** Bu klasörler exclude'da kalsın:
  ```json
  "exclude": [
    "node_modules",
    "scripts",         // ← Bu kalmalı
    "tests",           // ← Bu kalmalı
    "typechain-types", // ← Bu kalmalı
    "workers"          // ← Bu kalmalı
  ]
  ```
- ✅ **KONTROL:** Bu klasörler Next.js build'ine dahil edilmemeli

**Değiştirirsen:**
- Mutlaka `pnpm build` çalıştır
- Eğer exclude'dan çıkarırsan, script/test dosyalarındaki type hataları build'i bloklar

---

## 🔍 Genel TypeScript Kuralları

### 1. Type Assertions (`as`)

**Ne Zaman Kullan:**
- Viem contract read'lerinde `unknown` tipi geldiğinde
- MongoDB'den gelen string değerleri `bigint`'e çevirirken
- Tuple destructuring'de TypeScript'in tip çıkarımı yeterli olmadığında

**Örnek:**
```typescript
// ✅ DOĞRU
const balance18 = balanceResult.result as bigint
const amount = Number(formatUnits(BigInt(balance.amountToken18), 18))
```

### 2. Tuple Destructuring

**Ne Zaman Kullan:**
- Contract fonksiyonları tuple döndürdüğünde
- `countries()`, `getConfig()` gibi fonksiyonlar tuple döndürür

**Örnek:**
```typescript
// ✅ DOĞRU
const [name, tokenAddress, exists, price8, kappa8, lambda8, priceMin8] = result

// ❌ YANLIŞ
const name = result.name  // Property access çalışmaz!
```

### 3. Redis Client API

**Dikkat:**
- `lib/redis.ts` artık async `getRedis()` döndürüyor
- Eski `redisClient` export'u backward compatibility için var ama yeni kodda kullanma
- Yeni kodda: `const redis = await getRedis()`

### 4. NextRequest vs Request

**Dikkat:**
- API route'larda `NextRequest` kullan
- `Request` kullanırsan `req.cookies`, `req.ip` gibi özellikler yok
- IP almak için header'lardan oku

---

## 🚨 Yaygın Hatalar ve Çözümleri

### Hata 1: "Property 'ip' does not exist on type 'Request'"

**Çözüm:**
```typescript
// ❌ YANLIŞ
const ip = req.ip

// ✅ DOĞRU
const ip =
  req.headers.get('x-forwarded-for') ??
  req.headers.get('x-real-ip') ??
  'unknown'
```

### Hata 2: "Property 'name' does not exist on type 'readonly [...]'"

**Çözüm:**
```typescript
// ❌ YANLIŞ
const name = result.name

// ✅ DOĞRU
const [name, tokenAddress, exists, price8, ...] = result
```

### Hata 3: "'balance18' is of type 'unknown'"

**Çözüm:**
```typescript
// ❌ YANLIŞ
const balance18 = balanceResult.result

// ✅ DOĞRU
const balance18 = balanceResult.result as bigint
```

### Hata 4: "Argument of type 'string' is not assignable to parameter of type 'bigint'"

**Çözüm:**
```typescript
// ❌ YANLIŞ
formatUnits(balance.amountToken18, 18)

// ✅ DOĞRU
formatUnits(BigInt(balance.amountToken18), 18)
```

### Hata 5: "Cannot find module '@/lib/referralRewards'"

**Çözüm:**
- Bu modül projede yok
- Eğer kullanmak istiyorsan, önce modülü oluştur
- Ya da import'u kaldır ve alternatif çözüm kullan

---

## 📝 Commit Mesajı Örneği

```
fix: type assertions for contract reads and MongoDB string conversions

- Add type assertion for result.result in profile inventory
- Convert amountToken18 string to bigint before formatUnits
- Fix tuple destructuring in countries/info route
- Remove req.ip usage in auth/verify route

Build: ✅ PASSING
```

---

## ✅ Checklist: Değişiklik Yapmadan Önce

- [ ] Değiştireceğim dosya kritik dosyalardan biri mi? (Yukarıdaki 5 dosya)
- [ ] Eğer öyleyse, o dosyanın "Dikkat Edilecekler" bölümünü okudum mu?
- [ ] TypeScript type hataları olabilir mi? (tuple, unknown, string→bigint)
- [ ] Redis client API değişikliği gerekiyor mu?
- [ ] NextRequest vs Request kullanımı doğru mu?
- [ ] `pnpm build` çalıştıracağım mı?

---

## ✅ Checklist: Değişiklik Yaptıktan Sonra

- [ ] `pnpm build` çalıştırdım
- [ ] Build başarılı (0 TypeScript hatası)
- [ ] Değiştirdiğim dosyadaki kritik noktaları kontrol ettim
- [ ] Commit mesajı açıklayıcı
- [ ] Commit yaptım

---

## 🎯 Sonuç

**Kural:** Bir dosyada değişiklik yap → `pnpm build` çalıştır → Hata yoksa commit

Bu kural, production'da çalışmayan kodun git'e girmesini engeller ve build sürecini güvenilir hale getirir.

**Tarih:** 2025-01-06  
**Build Durumu:** ✅ BAŞARILI  
**TypeScript Hataları:** 0

