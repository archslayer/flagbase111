# PowerShell script for quick referral system tests
# Run with: .\scripts\test-referral-curl.ps1

$baseUrl = "http://localhost:3000"

Write-Host "=== REFERRAL SYSTEM CURL TESTS ===" -ForegroundColor Cyan
Write-Host ""

# Test wallets
$inviter = "0x1C749c82B6F77afaB9Ee5AF5f02E57c559eFaA9F"
$invitee = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF"

# Test 1: Create invite code
Write-Host "Test 1: Create invite code" -ForegroundColor Yellow
$createBody = @{
    wallet = $inviter
} | ConvertTo-Json -Compress

$createResponse = Invoke-WebRequest -Uri "$baseUrl/api/invite/create" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $createBody `
    -ErrorAction Stop

$createData = $createResponse.Content | ConvertFrom-Json
$inviteCode = $createData.inviteCode

Write-Host "✅ Invite code created: $inviteCode" -ForegroundColor Green
Write-Host ""

# Test 2: Resolve invite code
Write-Host "Test 2: Resolve invite code" -ForegroundColor Yellow
$resolveResponse = Invoke-WebRequest -Uri "$baseUrl/api/referral/resolve?code=$inviteCode" `
    -Method GET `
    -ErrorAction Stop

$resolveData = $resolveResponse.Content | ConvertFrom-Json
Write-Host "✅ Resolved inviter: $($resolveData.refWallet)" -ForegroundColor Green
Write-Host ""

# Test 3: Join with referral code
Write-Host "Test 3: Join with referral code" -ForegroundColor Yellow
$joinBody = @{
    code = $inviteCode
    wallet = $invitee
} | ConvertTo-Json -Compress

$joinResponse = Invoke-WebRequest -Uri "$baseUrl/api/invite/join" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $joinBody `
    -ErrorAction Stop

$joinData = $joinResponse.Content | ConvertFrom-Json
Write-Host "✅ Join successful, inviter: $($joinData.inviter)" -ForegroundColor Green
Write-Host ""

# Test 4: Idempotent join (should return same result)
Write-Host "Test 4: Idempotent join" -ForegroundColor Yellow
$join2Response = Invoke-WebRequest -Uri "$baseUrl/api/invite/join" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $joinBody `
    -ErrorAction Stop

if ($join2Response.StatusCode -eq 200) {
    Write-Host "✅ Idempotent join successful" -ForegroundColor Green
} else {
    Write-Host "❌ Idempotent join failed" -ForegroundColor Red
}
Write-Host ""

# Test 5: Preview referral earnings
Write-Host "Test 5: Preview referral earnings" -ForegroundColor Yellow
$previewBody = @{
    wallet = $inviter
} | ConvertTo-Json -Compress

$previewResponse = Invoke-WebRequest -Uri "$baseUrl/api/referral/preview" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $previewBody `
    -ErrorAction Stop

$previewData = $previewResponse.Content | ConvertFrom-Json
Write-Host "✅ Preview successful, pending: $($previewData.pendingAmountUSDC6)" -ForegroundColor Green
Write-Host ""

# Test 6: MongoDB health check
Write-Host "Test 6: MongoDB health check" -ForegroundColor Yellow
$healthResponse = Invoke-WebRequest -Uri "$baseUrl/api/health/mongodb" `
    -Method GET `
    -ErrorAction Stop

$healthData = $healthResponse.Content | ConvertFrom-Json
if ($healthData.ok) {
    Write-Host "✅ MongoDB health OK" -ForegroundColor Green
} else {
    Write-Host "❌ MongoDB health failed" -ForegroundColor Red
}
Write-Host ""

# Test 7: Self-referral check (should fail with 409)
Write-Host "Test 7: Self-referral check (should fail)" -ForegroundColor Yellow
$selfReferralBody = @{
    code = $inviteCode
    wallet = $inviter
} | ConvertTo-Json -Compress

try {
    $selfResponse = Invoke-WebRequest -Uri "$baseUrl/api/invite/join" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $selfReferralBody `
        -ErrorAction Stop
    Write-Host "❌ Self-referral should have been rejected!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "✅ Self-referral correctly rejected (409)" -ForegroundColor Green
    } else {
        Write-Host "❌ Wrong error code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=== ALL TESTS COMPLETE ===" -ForegroundColor Cyan
