Write-Host "=== Checking all Fly.io apps ===" -ForegroundColor Cyan

Write-Host "`nAll apps:" -ForegroundColor Yellow
fly apps list

Write-Host "`nAll machines across all apps:" -ForegroundColor Yellow
fly machines list --all

Write-Host "`n=== To free up resources, run: ===" -ForegroundColor Green
Write-Host "fly apps destroy <app-name>"
Write-Host "OR"
Write-Host "fly machine destroy <machine-id>"
