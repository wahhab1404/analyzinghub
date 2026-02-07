# Test Subscription System
# This script tests the subscription warning and expiration processors

$baseUrl = "https://analyzhub.com"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Subscription System Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Process Warnings
Write-Host "Testing: Process Subscription Warnings" -ForegroundColor Yellow
Write-Host "Endpoint: $baseUrl/api/subscriptions/process-warnings" -ForegroundColor Gray

try {
    $warningsResponse = Invoke-RestMethod -Uri "$baseUrl/api/subscriptions/process-warnings" -Method POST -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $warningsResponse | ConvertTo-Json -Depth 5 | Write-Host
} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "--------------------------------" -ForegroundColor Gray
Write-Host ""

# Test 2: Process Expirations
Write-Host "Testing: Process Subscription Expirations" -ForegroundColor Yellow
Write-Host "Endpoint: $baseUrl/api/subscriptions/process-expiration" -ForegroundColor Gray

try {
    $expirationResponse = Invoke-RestMethod -Uri "$baseUrl/api/subscriptions/process-expiration" -Method POST -ContentType "application/json"
    Write-Host "✓ Success!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $expirationResponse | ConvertTo-Json -Depth 5 | Write-Host
} catch {
    Write-Host "✗ Failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
