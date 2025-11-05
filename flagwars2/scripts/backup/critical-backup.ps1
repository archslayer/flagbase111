# Critical Files Backup Script (Every 1 hour)
# Backs up only the most critical files

param(
    [string]$Message = "Critical backup - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

# Set working directory to project root
Set-Location $PSScriptRoot\..\..

# Critical files to backup
$criticalFiles = @(
    "components/ConnectAndLogin.tsx",
    "app/market/page.tsx", 
    "app/attack/page.tsx",
    "lib/core.ts",
    "lib/contracts.ts",
    "lib/tx.ts",
    "lib/jwt.ts",
    "lib/redis.ts",
    "lib/error-handler.ts",
    "app/api/trade/buy/route.ts",
    "app/api/trade/sell/route.ts",
    "app/api/trade/attack/route.ts",
    "app/api/auth/verify/route.ts",
    "app/api/auth/nonce/route.ts",
    "middleware.ts",
    "package.json",
    "tsconfig.json",
    ".env.local"
)

# Check if files exist and add them
$filesToAdd = @()
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        $filesToAdd += $file
        Write-Host "✓ Adding critical file: $file" -ForegroundColor Green
    } else {
        Write-Host "✗ Critical file not found: $file" -ForegroundColor Yellow
    }
}

if ($filesToAdd.Count -eq 0) {
    Write-Host "No critical files found to backup!" -ForegroundColor Red
    exit 1
}

# Add files to git one by one
foreach ($file in $filesToAdd) {
    git add $file
}

# Check if there are changes to commit
$gitStatus = git status --porcelain
if ($gitStatus) {
    # Commit changes
    git commit -m $Message
    Write-Host "✓ Critical backup completed: $Message" -ForegroundColor Green
    
    # Show commit info
    $lastCommit = git log -1 --oneline
    Write-Host "Latest commit: $lastCommit" -ForegroundColor Cyan
} else {
    Write-Host "No changes detected for critical backup" -ForegroundColor Yellow
}

# Show git status
Write-Host "`nGit Status:" -ForegroundColor Cyan
git status --short