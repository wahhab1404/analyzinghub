    # Fix Databento Live Service - Set Missing Environment Variables
    # This script sets the required secrets in Fly.io
    
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Fixing Databento Live Service Secrets" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if flyctl is installed
    try {
        fly version | Out-Null
        Write-Host "✅ Fly CLI ready" -ForegroundColor Green
    } catch {
        Write-Host "❌ Error: flyctl is not installed" -ForegroundColor Red
        Write-Host "Install it from: https://fly.io/docs/hands-on/install-flyctl/"
        exit 1
    }
    
    # Check if logged in
    try {
        fly auth whoami | Out-Null
    } catch {
        Write-Host "❌ Error: Not logged into Fly.io" -ForegroundColor Red
        Write-Host "Run: fly auth login"
        exit 1
    }
    
    Write-Host ""
    
    # Load values from parent .env file
    $envFile = "../.env"
    if (Test-Path $envFile) {
        Write-Host "📄 Loading values from $envFile" -ForegroundColor Blue
        Get-Content $envFile | ForEach-Object {
            if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                Set-Variable -Name $key -Value $value -Scope Script
            }
        }
    } else {
        Write-Host "⚠️  Warning: ../.env file not found" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Setting secrets for app: databento-live-svc" -ForegroundColor Cyan
    Write-Host ""
    
    # Set DATABENTO_API_KEY
    if (-not $DATABENTO_API_KEY) {
        Write-Host "❌ DATABENTO_API_KEY not found in .env" -ForegroundColor Red
        $DATABENTO_API_KEY = Read-Host "Enter DATABENTO_API_KEY"
    }
    Write-Host "Setting DATABENTO_API_KEY..." -ForegroundColor Yellow
    fly secrets set "DATABENTO_API_KEY=$DATABENTO_API_KEY" -a databento-live-svc
    
    # Set SUPABASE_URL
    if (-not $NEXT_PUBLIC_SUPABASE_URL) {
        Write-Host "❌ SUPABASE_URL not found in .env" -ForegroundColor Red
        $SUPABASE_URL = Read-Host "Enter SUPABASE_URL"
    } else {
        $SUPABASE_URL = $NEXT_PUBLIC_SUPABASE_URL
    }
    Write-Host "Setting SUPABASE_URL..." -ForegroundColor Yellow
    fly secrets set "SUPABASE_URL=$SUPABASE_URL" -a databento-live-svc
    
    # Set SUPABASE_SERVICE_ROLE_KEY
    if (-not $SUPABASE_SERVICE_ROLE_KEY) {
        Write-Host "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env" -ForegroundColor Red
        $SUPABASE_SERVICE_ROLE_KEY = Read-Host "Enter SUPABASE_SERVICE_ROLE_KEY"
    }
    Write-Host "Setting SUPABASE_SERVICE_ROLE_KEY..." -ForegroundColor Yellow
    fly secrets set "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" -a databento-live-svc
    
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "✅ Secrets set successfully!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "The app will automatically restart with the new secrets."
    Write-Host ""
    Write-Host "To verify the service is running:" -ForegroundColor Cyan
    Write-Host "  fly logs -a databento-live-svc"
    Write-Host ""
    Write-Host "To check app status:" -ForegroundColor Cyan
    Write-Host "  fly status -a databento-live-svc"
    Write-Host ""
