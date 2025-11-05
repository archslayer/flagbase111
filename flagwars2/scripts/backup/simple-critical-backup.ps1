param(
    [string]$Message = "Critical backup - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

Set-Location $PSScriptRoot\..\..

Write-Host "Starting critical backup..." -ForegroundColor Yellow

# Add critical files
git add components/ConnectAndLogin.tsx
git add app/market/page.tsx
git add app/attack/page.tsx
git add lib/core.ts
git add lib/contracts.ts
git add lib/tx.ts
git add lib/jwt.ts
git add lib/redis.ts
git add lib/error-handler.ts
git add app/api/trade/buy/route.ts
git add app/api/trade/sell/route.ts
git add app/api/trade/attack/route.ts
git add app/api/auth/verify/route.ts
git add app/api/auth/nonce/route.ts
git add middleware.ts
git add package.json
git add tsconfig.json

# Check for changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    git commit -m $Message
    Write-Host "✓ Critical backup completed: $Message" -ForegroundColor Green
    $lastCommit = git log -1 --oneline
    Write-Host "Latest commit: $lastCommit" -ForegroundColor Cyan
} else {
    Write-Host "No changes detected for critical backup" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Git Status:" -ForegroundColor Cyan
git status --short
