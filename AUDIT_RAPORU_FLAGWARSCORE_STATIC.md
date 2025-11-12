# 🔍 FlagWarsCore_Static.sol - Detaylı Audit Raporu

**Tarih:** 2025-01-XX  
**Kontrat:** `FlagWarsCore_Static.sol`  
**Solidity Versiyonu:** 0.8.24  
**Analiz Türü:** Manuel Kod İncelemesi + Slither Analizi

---

## 📋 ÖZET

Bu rapor, `FlagWarsCore_Static.sol` kontratının detaylı güvenlik ve kod kalitesi analizini içermektedir. Kontrat genel olarak iyi yazılmış ancak bazı kritik ve orta seviye sorunlar tespit edilmiştir.

**Genel Değerlendirme:**
- ✅ Reentrancy koruması mevcut (`nonReentrant`)
- ✅ CEI pattern doğru kullanılmış
- ✅ SafeERC20 kullanılıyor
- ⚠️ Bazı edge case'ler eksik kontrol edilmiş
- ⚠️ Bazı matematiksel hesaplamalarda potansiyel sorunlar var
- ⚠️ Deprecated fonksiyonlar kodda duruyor

---

## 🔴 KRİTİK SORUNLAR

### 1. **War-Balance Window Başlangıç Kontrolü Eksik**

**Lokasyon:** `_applyDeltaWithWarBalance()` - Satır 597-635

**Sorun:**
```solidity
// Roll window 1
if (block.timestamp - s1.windowStart > wb1Tier.windowSec) {
    s1.windowStart = block.timestamp;
    s1.attackCount = 1;
} else {
    s1.attackCount++;
}
```

**Problem:** İlk attack'te `s1.windowStart` 0 olduğunda, `block.timestamp - 0` çok büyük bir sayı olur ve underflow riski yoksa da mantık hatası oluşur. İlk attack'te window başlatılmıyor.

**Etki:** War-balance mekanizması ilk attack'lerde düzgün çalışmayabilir.

**Öneri:**
```solidity
if (s1.windowStart == 0 || block.timestamp - s1.windowStart > wb1Tier.windowSec) {
    s1.windowStart = block.timestamp;
    s1.attackCount = 1;
} else {
    s1.attackCount++;
}
```

**Öncelik:** 🔴 KRİTİK

---

### 2. **Anti-Dump Reserve Hesaplama Hatası**

**Lokasyon:** `_applyAntiDump()` - Satır 521-523

**Sorun:**
```solidity
// Percent of reserve (contract reserve = c.totalSupply)
uint256 reserve = c.totalSupply;
uint256 sellPctBps = reserve > 0 ? (amountToken18 * 10000) / reserve : 10000;
```

**Problem:** `c.totalSupply` contract'taki token miktarını değil, kullanıcılara satılmamış token miktarını temsil ediyor. Ancak gerçek reserve `IERC20(c.token).balanceOf(address(this))` olmalı. Eğer kullanıcılar token'ları transfer etmişse, `totalSupply` ile gerçek balance uyumsuz olabilir.

**Etki:** Anti-dump hesaplaması yanlış olabilir, büyük satışlar kaçabilir veya küçük satışlar yanlış cezalandırılabilir.

**Öneri:**
```solidity
uint256 reserve = IERC20(c.token).balanceOf(address(this));
uint256 sellPctBps = reserve > 0 ? (amountToken18 * 10000) / reserve : 10000;
```

**Öncelik:** 🔴 KRİTİK

---

### 3. **Sell İşleminde Balance Kontrolü Sırası**

**Lokasyon:** `sell()` - Satır 279-282

**Sorun:**
```solidity
// Contract USDC balance check AFTER anti-dump (check final amount to be paid)
if (IERC20(config.payToken).balanceOf(address(this)) < finalProceedsUSDC6) {
    revert InsufficientTreasuryUSDC();
}

// CHECKS: Collect tokens from user first
IERC20(c.token).safeTransferFrom(msg.sender, address(this), amountToken18);
```

**Problem:** Balance kontrolü token transferinden ÖNCE yapılıyor, ancak bu kontrol anti-dump hesaplamasından SONRA yapılıyor. Eğer contract'ta yeterli USDC yoksa, kullanıcı token'larını zaten transfer etmiş olabilir (ama burada henüz transfer edilmemiş).

**Etki:** Kullanıcı token'larını kaybedebilir ama USDC alamayabilir.

**Not:** Aslında token transferi daha sonra yapılıyor, bu doğru. Ancak balance kontrolü çok erken yapılıyor - anti-dump hesaplamasından sonra ama token transferinden önce. Bu mantıklı görünüyor ama dikkat edilmeli.

**Öncelik:** 🟡 ORTA (Kod doğru görünüyor ama dikkat gerekiyor)

---

## 🟡 ORTA SEVİYE SORUNLAR

### 4. **Deprecated Fonksiyonlar Kodda Duruyor**

**Lokasyon:** Satır 643-654, 492-497

**Sorun:**
```solidity
function _splitFees(uint256 grossUSDC6) internal returns (uint256 netUSDC6) {
    // Fees are now handled in buy() function using pull pattern
    // This function is deprecated but kept for compatibility
    uint256 totalFee = (grossUSDC6 * config.entryFeeBps) / 10000;
    return grossUSDC6 - totalFee;
}

function _applyWarBalance(address user, uint256 baseFeeUSDC6) internal returns (uint256 finalFeeUSDC6) {
    // This function is deprecated - war-balance now affects delta, not fee
    return baseFeeUSDC6;
}

function _updateWarBalanceCounters(address user) internal {
    // This function is deprecated - war-balance is now target country-based
}
```

**Problem:** Bu fonksiyonlar hiçbir yerde kullanılmıyor ama kodda duruyor. Gas optimizasyonu açısından kaldırılmalı veya gerçekten kullanılıyorsa dokümantasyon güncellenmeli.

**Etki:** Gereksiz kod, karışıklık, potansiyel güvenlik riski (eğer yanlışlıkla kullanılırsa).

**Öneri:** Kullanılmıyorsa kaldırılmalı veya `unused` olarak işaretlenmeli.

**Öncelik:** 🟡 ORTA

---

### 5. **getSellPrice() Anti-Dump Fee'leri İçermiyor**

**Lokasyon:** `getSellPrice()` - Satır 814-826

**Sorun:**
```solidity
function getSellPrice(uint256 countryId, uint256 amountToken18) external view returns (uint256) {
    // ...
    // Apply sell fee using config (configurable)
    uint256 feeUSDC6 = (grossProceedsUSDC6 * config.sellFeeBps) / 10000;
    return grossProceedsUSDC6 - feeUSDC6;
}
```

**Problem:** Fonksiyon sadece base sell fee'yi döndürüyor, anti-dump extra fee'lerini içermiyor. Dokümantasyonda belirtilmiş ama UI'da yanlış fiyat gösterilebilir.

**Etki:** Kullanıcılar yanlış fiyat görebilir, slippage hesaplamaları yanlış olabilir.

**Not:** Dokümantasyonda belirtilmiş: "does NOT include anti-dump extra fees"

**Öncelik:** 🟡 ORTA (Dokümantasyon var ama dikkat gerekiyor)

---

### 6. **Attack Batch'te Free Attack Kontrolü Yok**

**Lokasyon:** `attackBatch()` - Satır 434-444

**Sorun:**
```solidity
// CHECKS: Precompute fees and deltas for all items (ensures consistency)
// NOTE: Batch attacks never use free attacks - free attacks are only for single attack() calls
uint256[] memory itemFee = new uint256[](items.length);
uint256[] memory itemDelta = new uint256[](items.length);

// Precompute: calculate fee and delta for each item (always paid attacks)
for (uint256 i = 0; i < items.length; i++) {
    Country storage fromCountry = countries[items[i].fromId];
    itemFee[i] = _calculateAttackFee(fromCountry.price);
    itemDelta[i] = _calculateAttackDelta(fromCountry.price);
}
```

**Problem:** Batch attack'lerde free attack kullanılamıyor. Bu tasarım kararı olabilir ama kullanıcılar için tutarsız görünebilir. Ayrıca, batch attack'te free attack kullanılamayacağı açıkça belirtilmeli.

**Etki:** Kullanıcı deneyimi sorunları, beklenmedik davranış.

**Öncelik:** 🟡 ORTA (Tasarım kararı ama dokümantasyon gerekli)

---

### 7. **PRICE_MIN Değeri Çok Düşük**

**Lokasyon:** Satır 39

**Sorun:**
```solidity
uint256 public constant PRICE_MIN = 1; // 0.00000001 * 1e8 (minimum tick, 8 decimals)
```

**Problem:** PRICE_MIN = 1 (8 decimals) = 0.00000001 USDC, bu çok küçük bir değer. Pratikte fiyat bu kadar düşemez çünkü matematiksel hesaplamalar rounding nedeniyle daha yüksek kalır. Ancak bu değer çok küçük olduğu için bazı edge case'lerde sorun yaratabilir.

**Etki:** Edge case'lerde beklenmedik davranışlar.

**Öncelik:** 🟡 ORTA (Pratikte sorun yaratmayabilir ama dikkat gerekiyor)

---

### 8. **getRemainingSupply() ve remainingSupply() Aynı İşi Yapıyor**

**Lokasyon:** Satır 1238-1257

**Sorun:**
```solidity
function getRemainingSupply(uint256 id) external view returns (uint256 remaining) {
    // Return actual contract balance (more reliable than totalSupply)
    return IERC20(c.token).balanceOf(address(this));
}

function remainingSupply(uint256 id) external view returns (uint256 remaining) {
    // Return actual contract balance (more reliable than totalSupply)
    return IERC20(c.token).balanceOf(address(this));
}
```

**Problem:** İki fonksiyon tamamen aynı işi yapıyor. Biri deprecated olmalı veya kaldırılmalı.

**Etki:** Kod tekrarı, karışıklık.

**Öncelik:** 🟡 ORTA

---

## 🟢 DÜŞÜK SEVİYE / İYİLEŞTİRME ÖNERİLERİ

### 9. **Matematiksel Hesaplamalarda Precision Loss**

**Lokasyon:** `buy()` - Satır 189-193

**Sorun:**
```solidity
uint256 unitPrice8 = c.price + (KAPPA / 2);
uint256 totalCost8 = (unitPrice8 * amountToken18) / 1e18;
uint256 totalCostUSDC6 = totalCost8 / 100; // Divide by 1e2
```

**Problem:** `/ 100` işlemi precision loss'a neden olabilir. Örneğin, `totalCost8 = 199` ise, `199 / 100 = 1` olur, 0.99 USDC kaybolur.

**Etki:** Küçük miktarlarda rounding hataları.

**Öncelik:** 🟢 DÜŞÜK (Küçük miktarlar için önemli değil)

---

### 10. **Event Parametrelerinde Tutarsızlık**

**Lokasyon:** `Buy` event - Satır 122

**Sorun:**
```solidity
event Buy(uint256 indexed countryId, address indexed buyer, uint256 amountToken18, uint256 priceUSDC8, uint256 totalCostUSDC6);
```

**Problem:** Event'te `priceUSDC8` parametresi var ama bu 8 decimals. Ancak event'te hem `priceUSDC8` hem de `totalCostUSDC6` var, bu karışıklığa neden olabilir.

**Etki:** Event parsing'de karışıklık.

**Öncelik:** 🟢 DÜŞÜK

---

### 11. **Constructor'da _treasury Parametresi Kullanılmıyor**

**Lokasyon:** Constructor - Satır 136-154

**Sorun:**
```solidity
constructor(
    address _payToken,
    address _treasury,
    address _revenue,
    address _commissions
) Ownable2Step() {
    // ...
    config = Config({
        payToken: _payToken,
        treasury: address(this), // Treasury is always the contract itself
        // ...
    });
}
```

**Problem:** `_treasury` parametresi alınıyor ama kullanılmıyor. Her zaman `address(this)` kullanılıyor.

**Etki:** Gereksiz parametre, karışıklık.

**Öneri:** Parametreyi kaldır veya dokümantasyonda açıkça belirt.

**Öncelik:** 🟢 DÜŞÜK

---

### 12. **setConfig() Fonksiyonunda _treasury Parametresi İgnore Ediliyor**

**Lokasyon:** `setConfig()` - Satır 922-940

**Sorun:**
```solidity
function setConfig(
    address _payToken,
    address _treasury,
    address _revenue,
    address _commissions
) external onlyOwner nonReentrant {
    // ...
    config.treasury = address(this); // Always contract itself, ignore _treasury parameter
    // ...
}
```

**Problem:** `_treasury` parametresi alınıyor ama her zaman `address(this)` kullanılıyor. Bu tutarsızlık.

**Etki:** API tutarsızlığı, karışıklık.

**Öncelik:** 🟢 DÜŞÜK

---

## 🔵 KOD UYUMSUZLUKLARI

### 13. **Test Dosyasında PRICE_MIN Beklentisi Yanlış**

**Lokasyon:** `test/FlagWarsCore.test.js` - Satır 50

**Sorun:**
```javascript
expect(await core.PRICE_MIN()).to.equal(1_000_000);
```

**Problem:** Test dosyasında `PRICE_MIN = 1_000_000` bekleniyor ama kontrat'ta `PRICE_MIN = 1` tanımlı.

**Etki:** Testler başarısız olabilir.

**Öncelik:** 🔴 KRİTİK (Test uyumsuzluğu)

---

### 14. **getConfig() Return Type Uyumsuzluğu**

**Lokasyon:** `getConfig()` - Satır 1018-1075

**Sorun:**
```solidity
function getConfig() external view returns (
    address payToken,
    address feeToken,
    address treasury,
    // ...
    uint16 buyFeeBps,
    uint16 sellFeeBps,
    // ...
) {
    return (
        config.payToken,
        address(0), // feeToken not used
        address(this), // treasury is always contract itself
        uint16(config.entryFeeBps), // uint256 -> uint16 cast
        // ...
    );
}
```

**Problem:** `config.entryFeeBps` ve `config.sellFeeBps` `uint256` ama return type `uint16`. Overflow riski var.

**Etki:** Eğer fee'ler 65535'ten büyükse overflow olur.

**Öncelik:** 🟡 ORTA

---

## 🟣 MOCK/TEST SORUNLARI

### 15. **Test Dosyasında Mock Token Approval Eksik**

**Lokasyon:** `test/FlagWarsCore.test.js`

**Sorun:** Test dosyasında bazı testlerde token approval yapılmadan transfer işlemleri deneniyor olabilir.

**Etki:** Testler başarısız olabilir.

**Öncelik:** 🟡 ORTA

---

## 📊 ÖZET TABLO

| # | Sorun | Öncelik | Lokasyon | Durum |
|---|-------|---------|----------|-------|
| 1 | War-Balance window başlangıç kontrolü eksik | 🔴 KRİTİK | Satır 603, 611 | Düzeltilmeli |
| 2 | Anti-dump reserve hesaplama hatası | 🔴 KRİTİK | Satır 522 | Düzeltilmeli |
| 3 | Sell işleminde balance kontrolü sırası | 🟡 ORTA | Satır 279-288 | İncelenmeli |
| 4 | Deprecated fonksiyonlar kodda duruyor | 🟡 ORTA | Satır 643-654 | Temizlenmeli |
| 5 | getSellPrice() anti-dump fee'leri içermiyor | 🟡 ORTA | Satır 814 | Dokümantasyon var |
| 6 | Attack batch'te free attack kontrolü yok | 🟡 ORTA | Satır 434 | Dokümantasyon gerekli |
| 7 | PRICE_MIN değeri çok düşük | 🟡 ORTA | Satır 39 | İncelenmeli |
| 8 | getRemainingSupply() ve remainingSupply() aynı | 🟡 ORTA | Satır 1238-1257 | Birleştirilmeli |
| 9 | Matematiksel precision loss | 🟢 DÜŞÜK | Satır 193 | İyileştirilebilir |
| 10 | Event parametrelerinde tutarsızlık | 🟢 DÜŞÜK | Satır 122 | İyileştirilebilir |
| 11 | Constructor'da _treasury kullanılmıyor | 🟢 DÜŞÜK | Satır 138 | Temizlenmeli |
| 12 | setConfig()'de _treasury ignore ediliyor | 🟢 DÜŞÜK | Satır 934 | Dokümantasyon gerekli |
| 13 | Test dosyasında PRICE_MIN uyumsuzluğu | 🔴 KRİTİK | test/FlagWarsCore.test.js:50 | Düzeltilmeli |
| 14 | getConfig() return type uyumsuzluğu | 🟡 ORTA | Satır 1054-1055 | İncelenmeli |
| 15 | Test dosyasında mock token approval eksik | 🟡 ORTA | test/FlagWarsCore.test.js | İncelenmeli |

---

## ✅ İYİ PRATİKLER

1. ✅ **Reentrancy koruması:** Tüm external fonksiyonlarda `nonReentrant` kullanılmış
2. ✅ **CEI pattern:** Checks-Effects-Interactions pattern doğru uygulanmış
3. ✅ **SafeERC20:** Tüm ERC20 transferlerinde SafeERC20 kullanılmış
4. ✅ **Custom errors:** Gas optimizasyonu için custom errors kullanılmış
5. ✅ **Access control:** Ownable2Step ve Pausable kullanılmış
6. ✅ **Slippage protection:** Buy ve sell fonksiyonlarında slippage koruması var
7. ✅ **Deadline protection:** Tüm işlemlerde deadline kontrolü var
8. ✅ **Pull pattern:** Fee'ler pull pattern ile çekiliyor (reentrancy koruması)

---

## 🎯 ÖNERİLER

### Acil Düzeltmeler (Production Öncesi)

1. **War-Balance window başlangıç kontrolü düzeltilmeli** (Sorun #1)
2. **Anti-dump reserve hesaplama düzeltilmeli** (Sorun #2)
3. **Test dosyasındaki PRICE_MIN uyumsuzluğu düzeltilmeli** (Sorun #13)

### Önemli İyileştirmeler

1. Deprecated fonksiyonlar kaldırılmalı veya açıkça işaretlenmeli
2. getRemainingSupply() ve remainingSupply() birleştirilmeli
3. getConfig() return type'ları düzeltilmeli (uint16 overflow riski)
4. Constructor ve setConfig()'deki _treasury parametresi kaldırılmalı veya dokümante edilmeli

### İsteğe Bağlı İyileştirmeler

1. Matematiksel precision loss iyileştirilebilir
2. Event parametreleri daha tutarlı hale getirilebilir
3. Kod dokümantasyonu genişletilebilir

---

## 📝 SONUÇ

Kontrat genel olarak iyi yazılmış ve güvenlik önlemleri alınmış. Ancak **2 kritik sorun** ve **birkaç orta seviye sorun** tespit edilmiştir. Production'a çıkmadan önce bu sorunların düzeltilmesi önerilir.

**Genel Not:** 7.5/10

**Önerilen Aksiyon:** Kritik sorunlar düzeltildikten sonra tekrar audit yapılmalı.

---

*Bu rapor manuel kod incelemesi ve Slither analizi sonuçlarına dayanmaktadır. Production'a çıkmadan önce profesyonel bir güvenlik audit'i de önerilir.*

