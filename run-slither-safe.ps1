# Slither Security Analysis - Safe Execution Script
# This script runs Slither analysis safely without blocking Cursor

$ErrorActionPreference = "Continue"

Write-Host "Starting Slither security analysis..." -ForegroundColor Cyan

# Only analyze main production contract to avoid timeout
$mainContract = "contracts/FlagWarsCore_Production.sol"
$outputFile = "slither_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

Write-Host ""
Write-Host "Analyzing contract: $mainContract" -ForegroundColor Yellow
Write-Host "Output will be saved to: $outputFile" -ForegroundColor Gray
Write-Host "This may take 2-3 minutes..." -ForegroundColor Gray
Write-Host ""

# Run Slither using Hardhat compilation output
# First ensure contracts are compiled
Write-Host "Compiling contracts with Hardhat..." -ForegroundColor Gray
npx hardhat compile 2>&1 | Out-Null

Write-Host "Running Slither analysis..." -ForegroundColor Gray
# Use Hardhat platform to avoid solc issues - analyze entire project
python -m slither . --hardhat-ignore-compile 2>&1 | Out-File -FilePath $outputFile -Encoding utf8

Write-Host ""
Write-Host "Analysis complete!" -ForegroundColor Green
Write-Host "Report saved to: $outputFile" -ForegroundColor Cyan

# Show summary if file exists
if (Test-Path $outputFile) {
    $content = Get-Content $outputFile -ErrorAction SilentlyContinue
    if ($content) {
        $infoCount = ($content | Select-String "INFO:Detectors:").Count
        $highCount = ($content | Select-String "HIGH:").Count
        $mediumCount = ($content | Select-String "MEDIUM:").Count
        $lowCount = ($content | Select-String "LOW:").Count
        
        Write-Host ""
        Write-Host "Summary:" -ForegroundColor Yellow
        Write-Host "  Total findings: $infoCount" -ForegroundColor Gray
        if ($highCount -gt 0) { Write-Host "  HIGH severity: $highCount" -ForegroundColor Red }
        if ($mediumCount -gt 0) { Write-Host "  MEDIUM severity: $mediumCount" -ForegroundColor Yellow }
        if ($lowCount -gt 0) { Write-Host "  LOW severity: $lowCount" -ForegroundColor Cyan }
    }
}
