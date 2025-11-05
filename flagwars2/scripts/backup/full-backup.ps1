# Full Project Backup Script (Every 3 hours)
# Backs up the entire project

param(
    [string]$Message = "Full backup - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

# Set working directory to project root
Set-Location $PSScriptRoot\..\..

# Add all files (except those in .gitignore)
git add .

# Check if there are changes to commit
$gitStatus = git status --porcelain
if ($gitStatus) {
    # Commit changes
    git commit -m $Message
    Write-Host "✓ Full backup completed: $Message" -ForegroundColor Green
    
    # Show commit info
    $lastCommit = git log -1 --oneline
    Write-Host "Latest commit: $lastCommit" -ForegroundColor Cyan
    
    # Show file count
    $fileCount = ($gitStatus | Measure-Object).Count
    Write-Host "Files changed: $fileCount" -ForegroundColor Cyan
} else {
    Write-Host "No changes detected for full backup" -ForegroundColor Yellow
}

# Show git status
Write-Host "`nGit Status:" -ForegroundColor Cyan
git status --short

# Show repository size
$repoSize = (Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "`nRepository size: $([math]::Round($repoSize, 2)) MB" -ForegroundColor Cyan
