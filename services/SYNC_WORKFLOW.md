# Bolt ↔️ Local Repo Sync Workflow

This guide will help you keep your local repository in sync with changes made in Bolt.

## Recommended Workflow

### Option 1: Bolt as Primary (Recommended)

**Development Flow:**
1. Make changes in Bolt
2. Test in Bolt preview
3. Download project from Bolt
4. Sync to local repo
5. Push to GitHub
6. Auto-deploy to production

**Pros:**
- AI assistance while coding
- Instant preview
- Built-in tooling

**Cons:**
- Manual download step
- Need to sync regularly

### Option 2: Local as Primary

**Development Flow:**
1. Make changes locally
2. Test locally (`npm run dev`)
3. Push to GitHub
4. Import to Bolt if needed for AI assistance
5. Auto-deploy to production

**Pros:**
- Full Git control
- Use your preferred IDE
- Direct version control

**Cons:**
- No AI assistance while coding
- Need to manually test more

---

## Quick Sync Scripts

### For Windows (PowerShell)

Save this as `sync-from-bolt.ps1` in your local repo:

```powershell
#!/usr/bin/env pwsh

# Sync from Bolt - Download, Extract, and Update Local Files
# Usage: .\sync-from-bolt.ps1 <path-to-bolt-download.zip>

param(
    [Parameter(Mandatory=$true)]
    [string]$BoltZipPath
)

Write-Host "🔄 Starting Bolt sync process..." -ForegroundColor Cyan

# Check if file exists
if (-not (Test-Path $BoltZipPath)) {
    Write-Host "❌ Error: File not found: $BoltZipPath" -ForegroundColor Red
    exit 1
}

# Create temp directory
$tempDir = Join-Path $env:TEMP "bolt-sync-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "📦 Extracting Bolt project..." -ForegroundColor Yellow

# Extract zip
Expand-Archive -Path $BoltZipPath -DestinationPath $tempDir -Force

# Find the extracted project folder (might be nested)
$extractedFolder = Get-ChildItem -Path $tempDir -Directory | Select-Object -First 1
$sourcePath = $extractedFolder.FullName

Write-Host "🔍 Comparing files..." -ForegroundColor Yellow

# Files and folders to sync (exclude certain files)
$excludePatterns = @(
    ".git",
    ".env",
    ".env.local",
    "node_modules",
    ".next",
    "*.md",
    "*.log"
)

# Copy files
$filesCopied = 0
$filesSkipped = 0

Get-ChildItem -Path $sourcePath -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Replace($sourcePath, "").TrimStart("\")
    $targetPath = Join-Path $PWD $relativePath

    # Check if should skip
    $shouldSkip = $false
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "*$pattern*") {
            $shouldSkip = $true
            break
        }
    }

    if (-not $shouldSkip) {
        # Create directory if doesn't exist
        $targetDir = Split-Path -Parent $targetPath
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        # Copy file
        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        $filesCopied++
        Write-Host "  ✓ $relativePath" -ForegroundColor Green
    } else {
        $filesSkipped++
    }
}

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "`n✅ Sync complete!" -ForegroundColor Green
Write-Host "   📝 Files copied: $filesCopied" -ForegroundColor Cyan
Write-Host "   ⏭️  Files skipped: $filesSkipped" -ForegroundColor Gray
Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Review changes: git status"
Write-Host "   2. Test locally: npm run dev"
Write-Host "   3. Commit: git add . && git commit -m 'Sync from Bolt'"
Write-Host "   4. Push: git push origin main"
