# FlagWars Automated Backup System

Bu sistem, FlagWars projesini otomatik olarak yedeklemek için Git tabanlı bir backup sistemi sağlar.

## 🚀 Hızlı Başlangıç

### 1. Backup Sistemini Kurun
```powershell
# PowerShell'i Administrator olarak çalıştırın
.\scripts\backup\setup-automated-backup.ps1
```

### 2. Manuel Backup Çalıştırın
```powershell
# Kritik dosyaları yedekle (1 saatte bir otomatik)
.\scripts\backup\backup-manager.ps1 critical

# Tüm projeyi yedekle (3 saatte bir otomatik)
.\scripts\backup\backup-manager.ps1 full

# Backup durumunu kontrol et
.\scripts\backup\backup-manager.ps1 status
```

## 📋 Backup Türleri

### Critical Backup (Kritik Yedekleme)
- **Sıklık**: Her 1 saatte bir
- **Kapsam**: En kritik dosyalar
- **Dosyalar**:
  - `components/ConnectAndLogin.tsx`
  - `app/market/page.tsx`
  - `app/attack/page.tsx`
  - `lib/core.ts`
  - `lib/contracts.ts`
  - `lib/tx.ts`
  - `lib/jwt.ts`
  - `lib/redis.ts`
  - `lib/error-handler.ts`
  - `app/api/trade/*/route.ts`
  - `app/api/auth/*/route.ts`
  - `middleware.ts`
  - `package.json`
  - `tsconfig.json`
  - `.env.local`

### Full Backup (Tam Yedekleme)
- **Sıklık**: Her 3 saatte bir
- **Kapsam**: Tüm proje (`.gitignore` hariç)
- **Dosyalar**: Proje dizinindeki tüm dosyalar

## 🔧 Yönetim Komutları

```powershell
# Backup durumunu kontrol et
.\scripts\backup\backup-manager.ps1 status

# Kritik backup çalıştır
.\scripts\backup\backup-manager.ps1 critical

# Tam backup çalıştır
.\scripts\backup\backup-manager.ps1 full

# Özel mesaj ile backup
.\scripts\backup\backup-manager.ps1 critical -Message "Bug fix backup"
.\scripts\backup\backup-manager.ps1 full -Message "Feature complete backup"
```

## ⚙️ Otomatik Backup Kurulumu

### Windows Task Scheduler ile
1. PowerShell'i **Administrator** olarak çalıştırın
2. Proje dizinine gidin
3. Setup script'ini çalıştırın:
   ```powershell
   .\scripts\backup\setup-automated-backup.ps1
   ```

Bu komut şu scheduled task'ları oluşturur:
- `FlagWars-CriticalBackup` (her 1 saatte bir)
- `FlagWars-FullBackup` (her 3 saatte bir)

### Task'ları Yönetme
- **Task Scheduler** → **Task Scheduler Library** → **FlagWars-*** task'larını bulun
- Task'ları enable/disable edebilir, zamanlamalarını değiştirebilirsiniz

## 📁 Dosya Yapısı

```
scripts/backup/
├── README.md                           # Bu dosya
├── backup-manager.ps1                  # Ana yönetim script'i
├── critical-backup.ps1                 # Kritik dosyalar backup
├── full-backup.ps1                     # Tam proje backup
├── critical-backup.bat                 # Windows Task Scheduler için
├── full-backup.bat                     # Windows Task Scheduler için
├── setup-automated-backup.ps1          # Otomatik backup kurulum
└── backup.log                          # Backup log dosyası
```

## 🔍 Backup Logları

Backup işlemleri `scripts/backup/backup.log` dosyasına kaydedilir:
```
2024-01-20 14:30:00 - Critical backup executed
2024-01-20 15:30:00 - Critical backup executed
2024-01-20 16:00:00 - Full backup executed
```

## 🚨 Sorun Giderme

### Git Repository Bulunamıyor
```powershell
# Git repository'yi başlat
git init
git add .
git commit -m "Initial commit"
```

### PowerShell Execution Policy Hatası
```powershell
# Execution policy'yi geçici olarak değiştir
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### Scheduled Task Çalışmıyor
1. Task Scheduler'da task'ları kontrol edin
2. Task'ların "Run with highest privileges" seçeneğini kontrol edin
3. Task'ların doğru kullanıcı ile çalıştığını kontrol edin

## 💡 İpuçları

- **Manuel Backup**: Önemli değişikliklerden sonra manuel backup çalıştırın
- **Custom Mesajlar**: Backup'lara özel mesajlar ekleyerek ne için yapıldığını belirtin
- **Status Kontrolü**: Düzenli olarak `status` komutu ile backup durumunu kontrol edin
- **Log Takibi**: `backup.log` dosyasını düzenli olarak kontrol edin

## 🔄 Backup Geri Yükleme

```powershell
# Son commit'e geri dön
git reset --hard HEAD

# Belirli bir commit'e geri dön
git log --oneline  # Commit hash'ini bul
git reset --hard <commit-hash>

# Belirli dosyayı geri yükle
git checkout HEAD -- <file-path>
```

## 📊 Backup İstatistikleri

```powershell
# Repository boyutu
git count-objects -vH

# Commit geçmişi
git log --oneline --graph

# Değişiklik istatistikleri
git diff --stat HEAD~1
```
