# Backup Manager Script
# Manages all backup operations

param(
    [ValidateSet("critical", "full", "status", "setup")]
    [string]$Action = "status",
    [string]$Message = ""
)

# Set working directory to project root
Set-Location $PSScriptRoot\..\..

function Show-Status {
    Write-Host "=== FlagWars Backup Status ===" -ForegroundColor Cyan
    Write-Host ""
    
    # Git status
    Write-Host "Git Repository Status:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    
    # Recent commits
    Write-Host "Recent Commits:" -ForegroundColor Yellow
    git log --oneline -5
    Write-Host ""
    
    # Repository info
    $repoSize = (Get-ChildItem -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    $commitCount = (git rev-list --count HEAD)
    Write-Host "Repository Info:" -ForegroundColor Yellow
    Write-Host "  Size: $([math]::Round($repoSize, 2)) MB" -ForegroundColor White
    Write-Host "  Commits: $commitCount" -ForegroundColor White
    Write-Host "  Branch: $(git branch --show-current)" -ForegroundColor White
    Write-Host ""
}

function Setup-Backup {
    Write-Host "=== Setting up FlagWars Backup System ===" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if git is initialized
    if (-not (Test-Path ".git")) {
        Write-Host "Initializing Git repository..." -ForegroundColor Yellow
        git init
    }
    
    # Create backup directory
    if (-not (Test-Path "scripts/backup")) {
        New-Item -ItemType Directory -Path "scripts/backup" -Force
        Write-Host "Created backup directory" -ForegroundColor Green
    }
    
    # Create initial commit if needed
    $commitCount = (git rev-list --count HEAD 2>$null)
    if ($commitCount -eq 0) {
        Write-Host "Creating initial commit..." -ForegroundColor Yellow
        git add .
        git commit -m "Initial backup setup"
        Write-Host "Initial commit created" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Backup system setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Yellow
    Write-Host "  .\scripts\backup\backup-manager.ps1 critical" -ForegroundColor White
    Write-Host "  .\scripts\backup\backup-manager.ps1 full" -ForegroundColor White
    Write-Host "  .\scripts\backup\backup-manager.ps1 status" -ForegroundColor White
    Write-Host ""
}

switch ($Action) {
    "critical" {
        if ($Message) {
            & ".\scripts\backup\critical-backup.ps1" -Message $Message
        } else {
            & ".\scripts\backup\critical-backup.ps1"
        }
    }
    "full" {
        if ($Message) {
            & ".\scripts\backup\full-backup.ps1" -Message $Message
        } else {
            & ".\scripts\backup\full-backup.ps1"
        }
    }
    "status" {
        Show-Status
    }
    "setup" {
        Setup-Backup
    }
}
