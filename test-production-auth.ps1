# Test Production Authentication API
# Run this script to see the exact error messages from production

Write-Host "Testing Production Authentication API" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Register
Write-Host "Test 1: Register New User" -ForegroundColor Yellow
Write-Host "--------------------------" -ForegroundColor Yellow

$registerBody = @{
    email    = "test-debug-$(Get-Random)@example.com"
    password = "TestPassword123!"
    fullName = "Debug User"
    role     = "Trader"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest `
        -Uri "https://analyzhub.com/api/auth/register" `
        -Method Post `
        -ContentType "application/json" `
        -Body $registerBody `
        -UseBasicParsing

    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status: $statusCode" -ForegroundColor Red
    Write-Host "Error Response:" -ForegroundColor Red

    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    $reader.Close()

    # Pretty print JSON
    try {
        $errorBody | ConvertFrom-Json | ConvertTo-Json -Depth 10
    } catch {
        Write-Host $errorBody
    }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Login (with known credentials)
Write-Host "Test 2: Login Attempt" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Yellow

$loginBody = @{
    email    = "test@example.com"
    password = "Test12345!"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest `
        -Uri "https://analyzhub.com/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -UseBasicParsing

    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status: $statusCode" -ForegroundColor Red
    Write-Host "Error Response:" -ForegroundColor Red

    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    $reader.Close()

    # Pretty print JSON
    try {
        $errorBody | ConvertFrom-Json | ConvertTo-Json -Depth 10
    } catch {
        Write-Host $errorBody
    }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "IMPORTANT: Look for these key fields in the error response:" -ForegroundColor Yellow
Write-Host "  - error: The main error message" -ForegroundColor White
Write-Host "  - envMeta.urlHost: Should be your Supabase project host" -ForegroundColor White
Write-Host "  - envMeta.anonPrefix: First 10 chars of anon key" -ForegroundColor White
Write-Host "  - supabase.code: Specific error code from Supabase" -ForegroundColor White
Write-Host ""
