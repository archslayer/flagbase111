# Automated Backup Setup Script
# Creates Windows Task Scheduler tasks for automatic backups

param(
    [switch]$Force
)

Write-Host "=== FlagWars Automated Backup Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "⚠️  This script requires administrator privileges to create scheduled tasks." -ForegroundColor Yellow
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Run backups manually using:" -ForegroundColor Cyan
    Write-Host "  .\scripts\backup\backup-manager.ps1 critical" -ForegroundColor White
    Write-Host "  .\scripts\backup\backup-manager.ps1 full" -ForegroundColor White
    exit 1
}

# Get project directory
$projectDir = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$criticalBackupPath = Join-Path $projectDir "scripts\backup\critical-backup.bat"
$fullBackupPath = Join-Path $projectDir "scripts\backup\full-backup.bat"

Write-Host "Project Directory: $projectDir" -ForegroundColor Green
Write-Host "Critical Backup: $criticalBackupPath" -ForegroundColor Green
Write-Host "Full Backup: $fullBackupPath" -ForegroundColor Green
Write-Host ""

# Create critical backup task (every 1 hour)
Write-Host "Creating Critical Backup Task (every 1 hour)..." -ForegroundColor Yellow
$criticalTaskName = "FlagWars-CriticalBackup"

# Remove existing task if exists
$existingTask = Get-ScheduledTask -TaskName $criticalTaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    if ($Force) {
        Unregister-ScheduledTask -TaskName $criticalTaskName -Confirm:$false
        Write-Host "Removed existing critical backup task" -ForegroundColor Yellow
    } else {
        Write-Host "Critical backup task already exists. Use -Force to replace." -ForegroundColor Yellow
    }
}

if (-not $existingTask -or $Force) {
    $action = New-ScheduledTaskAction -Execute $criticalBackupPath -WorkingDirectory $projectDir
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 365)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType InteractiveToken
    
    Register-ScheduledTask -TaskName $criticalTaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "FlagWars Critical Files Backup (every 1 hour)"
    Write-Host "✓ Critical backup task created successfully" -ForegroundColor Green
}

# Create full backup task (every 3 hours)
Write-Host "Creating Full Backup Task (every 3 hours)..." -ForegroundColor Yellow
$fullTaskName = "FlagWars-FullBackup"

# Remove existing task if exists
$existingTask = Get-ScheduledTask -TaskName $fullTaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    if ($Force) {
        Unregister-ScheduledTask -TaskName $fullTaskName -Confirm:$false
        Write-Host "Removed existing full backup task" -ForegroundColor Yellow
    } else {
        Write-Host "Full backup task already exists. Use -Force to replace." -ForegroundColor Yellow
    }
}

if (-not $existingTask -or $Force) {
    $action = New-ScheduledTaskAction -Execute $fullBackupPath -WorkingDirectory $projectDir
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 3) -RepetitionDuration (New-TimeSpan -Days 365)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType InteractiveToken
    
    Register-ScheduledTask -TaskName $fullTaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "FlagWars Full Project Backup (every 3 hours)"
    Write-Host "✓ Full backup task created successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Scheduled Tasks Created:" -ForegroundColor Yellow
Write-Host "  • FlagWars-CriticalBackup (every 1 hour)" -ForegroundColor White
Write-Host "  • FlagWars-FullBackup (every 3 hours)" -ForegroundColor White
Write-Host ""
Write-Host "You can manage these tasks in:" -ForegroundColor Cyan
Write-Host "  Task Scheduler → Task Scheduler Library → FlagWars-*" -ForegroundColor White
Write-Host ""
Write-Host "Manual backup commands:" -ForegroundColor Cyan
Write-Host "  .\scripts\backup\backup-manager.ps1 critical" -ForegroundColor White
Write-Host "  .\scripts\backup\backup-manager.ps1 full" -ForegroundColor White
Write-Host "  .\scripts\backup\backup-manager.ps1 status" -ForegroundColor White
Write-Host ""

# Test run
$testRun = Read-Host "Would you like to run a test backup now? (y/n)"
if ($testRun -eq 'y' -or $testRun -eq 'Y') {
    Write-Host "Running test critical backup..." -ForegroundColor Yellow
    & ".\scripts\backup\critical-backup.ps1"
}
