# Teşhis Scriptleri - Final Rapor

**Tarih:** 2025-11-05  
**Durum:** ✅ 4 teşhis scripti oluşturuldu, kod değiştirilmedi

---

## ✅ OLUŞTURULAN SCRIPTLER

### 1. `scripts/check-env-print.ts`
**Amaç:** Next.js dışında düz Node ortamında .env.local değerlerini görmek

**Kullanım:**
```bash
pnpm tsx scripts/check-env-print.ts
```

**Çıktı:**
- `NEXT_PUBLIC_CORE_ADDRESS`
- `NEXT_PUBLIC_RPC_BASE_SEPOLIA`
- `NEXT_PUBLIC_CHAIN_ID`

**Özellikler:**
- `dotenv` ile `.env.local` dosyasını yükler
- Next.js gibi davranır
- Sadece env değişkenlerini yazdırır

---

### 2. `scripts/check-core-country.ts`
**Amaç:** Core contract'tan country kaydını zincirden okumak

**Kullanım:**
```bash
pnpm tsx scripts/check-core-country.ts [countryId]
```

**Örnek:**
```bash
pnpm tsx scripts/check-core-country.ts 1
pnpm tsx scripts/check-core-country.ts 90
```

**Çıktı:**
- Core adresi
- Country ID
- Country Name
- Token adresi (Core'un söylediği)
- Exists durumu
- Price8, Kappa8, Lambda8, PriceMin8 değerleri

**Özellikler:**
- `process.env.NEXT_PUBLIC_CORE_ADDRESS` kullanır
- `process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA` kullanır (yoksa fallback)
- Viem ile Base Sepolia'ya bağlanır
- Sadece `countries()` fonksiyonunu parse eder

**Kullanım Senaryosu:**
"UI neden 0 diyor?" sorusunda ilk bakılacak şey: Core şu an hangi token adresini söylüyor?

---

### 3. `scripts/check-user-balances.ts`
**Amaç:** "No tokens owned" diyen UI'nin baktığı token'da cüzdanın gerçekten bakiyesi var mı kontrol etmek

**Kullanım:**
```bash
pnpm tsx scripts/check-user-balances.ts 0xUSERADDRESS [countryId]
```

**Örnek:**
```bash
pnpm tsx scripts/check-user-balances.ts 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
pnpm tsx scripts/check-user-balances.ts 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 90
```

**Çıktı:**
- User adresi
- Country ID
- Token adresi (Core'dan alınan)
- Raw balance (wei cinsinden)
- Decimals (18 decimals kabul edilerek)

**Özellikler:**
- Önce Core'dan country bilgisini okur
- Token adresini Core'dan alır
- ERC20 `balanceOf()` ile bakiyeyi okur
- 18 decimals kabul eder

**Kullanım Senaryosu:**
"Evet, zincirde gerçekten 0, UI haklı" ya da "Hayır, zincirde 1 var, o zaman bizim /api/profile/inventory başka Core'a bakıyor demek."

---

### 4. `scripts/check-treasury-allowance.ts`
**Amaç:** Buy tarafındaki "Admin action required: Treasury has not approved Core" mesajını doğrulamak

**Kullanım:**
```bash
pnpm tsx scripts/check-treasury-allowance.ts [countryId] [treasuryAddress]
```

**Örnek:**
```bash
# .env.local'deki TREASURY_ADDRESS kullanır
pnpm tsx scripts/check-treasury-allowance.ts 1

# Manuel treasury adresi
pnpm tsx scripts/check-treasury-allowance.ts 1 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

**Çıktı:**
- Core adresi
- Token adresi
- Treasury adresi
- Allowance (raw)
- Allowance (18 decimals)
- Uyarı mesajı (allowance 0 ise)

**Özellikler:**
- Core'dan country bilgisini okur
- Token adresini Core'dan alır
- ERC20 `allowance(treasury, core)` okur
- `.env.local`'deki `TREASURY_ADDRESS` kullanır (varsa)
- Manuel treasury adresi de verilebilir

**Kullanım Senaryosu:**
"0 ise frontend'in uyarısı doğru, çünkü zincirde gerçekten 0" diyeceğiz.

---

## 📋 ÇALIŞTIRMA ÖRNEKLERİ

### Temel Kontroller:
```bash
# 1. ENV değerlerini kontrol et
pnpm tsx scripts/check-env-print.ts

# 2. Core'dan country 1 bilgisini oku
pnpm tsx scripts/check-core-country.ts 1

# 3. Kullanıcı bakiyesini kontrol et
pnpm tsx scripts/check-user-balances.ts 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# 4. Treasury allowance'ını kontrol et
pnpm tsx scripts/check-treasury-allowance.ts 1
```

### Farklı Country'ler için:
```bash
# Country 90 için kontrol
pnpm tsx scripts/check-core-country.ts 90
pnpm tsx scripts/check-user-balances.ts 0xUSER 90
pnpm tsx scripts/check-treasury-allowance.ts 90
```

---

## 🔍 TEŞHİS AKIŞI

### Sorun 1: "No tokens owned"
```bash
# 1. Kullanıcının bakiyesi var mı kontrol et
pnpm tsx scripts/check-user-balances.ts 0xUSERADDRESS

# 2. Core hangi token adresini söylüyor?
pnpm tsx scripts/check-core-country.ts 1

# 3. Eğer bakiye varsa ama UI 0 gösteriyorsa:
#    - /api/profile/inventory başka Core'a bakıyor olabilir
#    - RPC endpoint yanlış chain'e bağlanıyor olabilir
```

### Sorun 2: "Treasury has not approved"
```bash
# 1. Treasury allowance'ını kontrol et
pnpm tsx scripts/check-treasury-allowance.ts 1

# 2. Eğer allowance 0 ise:
#    - Frontend uyarısı doğru
#    - Admin'in approval vermesi gerekiyor
#    - Yanlış Core adresi kullanılıyor olabilir
```

### Sorun 3: "Portfolio value 0"
```bash
# 1. ENV değerlerini kontrol et
pnpm tsx scripts/check-env-print.ts

# 2. Core'dan country bilgilerini oku
pnpm tsx scripts/check-core-country.ts 1

# 3. Kullanıcı bakiyelerini kontrol et
pnpm tsx scripts/check-user-balances.ts 0xUSERADDRESS
```

---

## ⚠️ ÖNEMLİ NOTLAR

1. **Kod Değişikliği Yok:**
   - Hiçbir mevcut dosya değiştirilmedi
   - Sadece yeni script dosyaları eklendi
   - Projeyi derlemeyecek, Next.js tarafını etkilemeyecek

2. **Env Kullanımı:**
   - Tüm scriptler `.env.local` dosyasını okur
   - `dotenv` kullanarak Next.js gibi davranır
   - Hiçbir adres hardcode edilmedi

3. **RPC ve Chain:**
   - Tüm scriptler Base Sepolia'ya bağlanır
   - `process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA` kullanır
   - Fallback: `https://sepolia.base.org`

4. **ABI:**
   - Sadece gerekli fonksiyonlar parse edilir
   - Minimal ABI kullanımı
   - Viem `parseAbi` kullanır

---

## 📊 BEKLENEN SONUÇLAR

Bu scriptlerle şunları kesin olarak anlayacağız:

1. **ENV Doğru Yükleniyor mu?**
   - `check-env-print.ts` ile kontrol

2. **Core Hangi Token Adreslerini Söylüyor?**
   - `check-core-country.ts` ile kontrol

3. **Kullanıcının Gerçekten Bakiyesi Var mı?**
   - `check-user-balances.ts` ile kontrol
   - UI "0" diyor ama zincirde varsa: API yanlış Core'a bakıyor

4. **Treasury Gerçekten Allowance Vermiş mi?**
   - `check-treasury-allowance.ts` ile kontrol
   - 0 ise: Frontend uyarısı doğru, admin approval vermeli
   - 0 değilse: Frontend yanlış Core'a bakıyor olabilir

---

**Rapor Oluşturuldu:** 2025-11-05  
**Durum:** ✅ Teşhis scriptleri hazır  
**Sonraki Adım:** Scriptleri çalıştır ve sonuçları analiz et

