# Automated Bolt ↔️ Local Sync Guide

## Quick Start (Recommended Method)

### Step 1: Initial Setup (One-Time)

In your **local repository**, run these commands:

```bash
# Make sync script executable (Mac/Linux)
chmod +x sync-from-bolt.sh

# Or for Windows, ensure PowerShell execution policy allows scripts
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Step 2: Daily Workflow

**When you make changes in Bolt:**

1. **Download from Bolt**
   - Click "Download Project" button in Bolt (top-right)
   - Save ZIP to your Downloads folder

2. **Run Sync Script**

   **Windows (PowerShell):**
   ```powershell
   .\sync-from-bolt.ps1 "$env:USERPROFILE\Downloads\project.zip"
   ```

   **Mac/Linux:**
   ```bash
   ./sync-from-bolt.sh ~/Downloads/project.zip
   ```

3. **Review and Push**
   ```bash
   # Review changes
   git status
   git diff

   # Test locally
   npm run dev

   # Commit and push
   git add .
   git commit -m "Sync from Bolt: [describe changes]"
   git push origin main
   ```

---

## Advanced: Automated Watching (Optional)

### Option A: Watch Downloads Folder

Create a file watcher that automatically syncs when Bolt download appears:

**Windows (PowerShell) - `watch-bolt-downloads.ps1`:**

```powershell
$watchPath = "$env:USERPROFILE\Downloads"
$filter = "project*.zip"

Write-Host "👀 Watching for Bolt downloads in: $watchPath" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $watchPath
$watcher.Filter = $filter
$watcher.EnableRaisingEvents = $true

$action = {
    $path = $Event.SourceEventArgs.FullPath
    Write-Host "`n📦 New Bolt download detected: $path" -ForegroundColor Green

    Start-Sleep -Seconds 2  # Wait for download to complete

    Write-Host "🔄 Auto-syncing..." -ForegroundColor Cyan
    & .\sync-from-bolt.ps1 $path

    Write-Host "`n✅ Auto-sync complete! Review changes with 'git status'" -ForegroundColor Green
}

Register-ObjectEvent $watcher "Created" -Action $action

while ($true) {
    Start-Sleep -Seconds 1
}
```

**Mac/Linux - `watch-bolt-downloads.sh`:**

```bash
#!/bin/bash

WATCH_PATH="$HOME/Downloads"
PROJECT_NAME="project"

echo "👀 Watching for Bolt downloads in: $WATCH_PATH"
echo "Press Ctrl+C to stop"

fswatch -0 "$WATCH_PATH" | while read -d "" path; do
    if [[ "$path" == *"$PROJECT_NAME"*.zip ]]; then
        echo ""
        echo "📦 New Bolt download detected: $path"
        sleep 2  # Wait for download to complete

        echo "🔄 Auto-syncing..."
        ./sync-from-bolt.sh "$path"

        echo ""
        echo "✅ Auto-sync complete! Review changes with 'git status'"
    fi
done
```

### Option B: Browser Extension (Future Enhancement)

You could create a simple browser extension that:
1. Detects when you download from Bolt
2. Automatically triggers sync via local script
3. Shows notification when sync is complete

---

## Best Practices

### 1. Always Test Before Pushing

```bash
# After sync, always run:
npm install  # In case dependencies changed
npm run build  # Ensure it builds
npm run dev  # Test locally
```

### 2. Use Meaningful Commit Messages

```bash
# Good commit messages:
git commit -m "Sync: Fix TelegramSettings translation error"
git commit -m "Sync: Add new financial dashboard features"
git commit -m "Sync: Update Arabic translations"

# Avoid:
git commit -m "sync"
git commit -m "update"
```

### 3. Review Changes Before Committing

```bash
# See what changed:
git status
git diff

# Review specific files:
git diff components/settings/TelegramSettings.tsx
```

### 4. Create Feature Branches for Major Changes

```bash
# For big features, use branches:
git checkout -b feature/new-dashboard
# ... make changes in Bolt ...
# ... sync ...
git commit -m "Add new dashboard feature"
git push origin feature/new-dashboard
# Create PR on GitHub
```

---

## Troubleshooting

### Issue: Sync script not found

**Solution:**
```bash
# Make sure you're in the project root
cd /path/to/your/project

# Check if script exists
ls -la sync-from-bolt.sh  # Mac/Linux
ls sync-from-bolt.ps1     # Windows
```

### Issue: Permission denied (Mac/Linux)

**Solution:**
```bash
chmod +x sync-from-bolt.sh
```

### Issue: Script execution blocked (Windows)

**Solution:**
```powershell
# Run as Administrator:
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Issue: Environment variables not synced

**Solution:**
- .env files are intentionally excluded from sync
- Manually update .env if needed
- Never commit .env to Git

### Issue: Merge conflicts

**Solution:**
```bash
# If you have local changes and sync causes conflicts:
git stash  # Save local changes
# Run sync script
git stash pop  # Restore local changes
# Resolve conflicts manually
```

---

## Cheat Sheet

### Quick Commands

```bash
# 1. Download from Bolt → Save to Downloads

# 2. Sync (Windows)
.\sync-from-bolt.ps1 "$env:USERPROFILE\Downloads\project.zip"

# 2. Sync (Mac/Linux)
./sync-from-bolt.sh ~/Downloads/project.zip

# 3. Test
npm run build && npm run dev

# 4. Push
git add . && git commit -m "Sync from Bolt" && git push
```

### One-Liner (after sync)

```bash
npm install && npm run build && git add . && git commit -m "Sync from Bolt" && git push origin main
```

---

## Alternative: Direct Git Sync (Advanced)

If you want even tighter integration, you could:

1. **Initialize Git in Bolt's working directory**
   - Not recommended as Bolt manages its own state

2. **Use Git submodules**
   - Complex, only for advanced users

3. **Use a shared remote**
   - Both Bolt and local push to same GitHub repo
   - Requires manual merge management

**Recommendation:** Stick with the download + sync script method above. It's simple, reliable, and gives you full control.
