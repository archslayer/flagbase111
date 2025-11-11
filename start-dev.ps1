# Start FlagWars Dev Server (Auto Port 3000 Management)
# Usage: .\start-dev.ps1

Write-Host "=== FLAGWARS DEV SERVER AUTO-START ===" -ForegroundColor Green
Write-Host ""

# Check if port 3000 is in use
$port3000 = netstat -ano | findstr :3000

if ($port3000) {
    Write-Host "⚠️  Port 3000 kullanımda, process sonlandırılıyor..." -ForegroundColor Yellow
    
    $process = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
    
    if ($process) {
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "  ✅ Process sonlandırıldı (PID: $process)" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Port 3000 boş" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Starting dev server..." -ForegroundColor Cyan
Write-Host ""

# Start dev server in current window
npm run dev

