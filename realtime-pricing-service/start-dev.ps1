# PowerShell script to start realtime-pricing-service
# Usage: .\start-dev.ps1

Write-Host "Starting Realtime Pricing Service..." -ForegroundColor Green

# Set environment variables
$env:POLYGON_API_KEY = "Fp_ytZA4gl9u1nZxxCmQ7rhl_mI0Kjto"
$env:SUPABASE_URL = "https://gbdzhdlpbwrnhykmestic.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8"
$env:PORT = "3001"
$env:NODE_ENV = "development"

Write-Host "Environment variables set" -ForegroundColor Yellow
Write-Host "  POLYGON_API_KEY: Set" -ForegroundColor Gray
Write-Host "  SUPABASE_URL: $env:SUPABASE_URL" -ForegroundColor Gray
Write-Host "  PORT: $env:PORT" -ForegroundColor Gray

Write-Host "`nStarting service on http://localhost:3001" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Gray

# Start the service
npm run dev
