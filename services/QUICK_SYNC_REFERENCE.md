# Quick Sync Reference

## The Fastest Way to Sync

### Step 1: Download from Bolt
Click "Download Project" in Bolt → Save to Downloads folder

### Step 2: Run Sync Script

**Windows:**
```powershell
.\sync-from-bolt.ps1 "$env:USERPROFILE\Downloads\project.zip"
```

**Mac/Linux:**
```bash
./sync-from-bolt.sh ~/Downloads/project.zip
```

### Step 3: Test & Deploy

```bash
# Test that everything works
npm run sync:test

# Review changes
git status
git diff

# Push to GitHub (auto-deploys to production)
npm run sync:push
```

**Or do it all at once:**
```bash
npm run sync:deploy
```

---

## What Gets Synced?

### ✅ Always Synced
- All source code files (`components/`, `app/`, `lib/`, `services/`)
- Configuration files (`package.json`, `tsconfig.json`, etc.)
- Supabase migrations and functions
- Public assets

### ⏭️ Never Synced (Intentional)
- `.git/` - Your Git history stays intact
- `.env` - Environment variables stay local
- `node_modules/` - Reinstalled via npm
- `.next/` - Build artifacts
- `*.log` - Log files

---

## Common Workflows

### Workflow 1: Quick Fix
```bash
# 1. Fix in Bolt
# 2. Download
# 3. Sync
./sync-from-bolt.sh ~/Downloads/project.zip

# 4. Quick push
npm run sync:deploy
```

### Workflow 2: Major Feature
```bash
# 1. Create feature branch
git checkout -b feature/new-dashboard

# 2. Build in Bolt
# 3. Download & Sync
./sync-from-bolt.sh ~/Downloads/project.zip

# 4. Test thoroughly
npm run dev

# 5. Commit & push
git add .
git commit -m "Add new dashboard with charts"
git push origin feature/new-dashboard

# 6. Create Pull Request on GitHub
```

### Workflow 3: Daily Updates
```bash
# Morning: Start with latest
git pull origin main

# Make changes in Bolt throughout the day

# Evening: Sync all changes
./sync-from-bolt.sh ~/Downloads/project.zip
git diff  # Review what changed
npm run sync:deploy
```

---

## Troubleshooting

### "Script not found"
```bash
# Make sure you're in the project root
cd /path/to/your/analyzinghub-project
pwd  # Verify location
```

### "Permission denied"
```bash
# Mac/Linux only:
chmod +x sync-from-bolt.sh
```

### "npm run build failed"
```bash
# Something broke during sync
# Option 1: Check what changed
git diff

# Option 2: Revert if needed
git checkout -- .

# Option 3: Fix the issue and try again
npm install
npm run build
```

### "Merge conflict"
```bash
# You have local changes that conflict
git status  # See what's conflicting

# Option 1: Keep your changes
git stash
./sync-from-bolt.sh ~/Downloads/project.zip
git stash pop
# Resolve conflicts manually

# Option 2: Discard local changes
git checkout -- .
./sync-from-bolt.sh ~/Downloads/project.zip
```

---

## Pro Tips

1. **Sync often** - Don't let Bolt and local diverge too much
2. **Always test** - Run `npm run sync:test` before pushing
3. **Use branches** - For experimental features
4. **Review diffs** - Always run `git diff` before committing
5. **Keep .env updated** - Manually sync environment variables if they change

---

## Need Help?

See full documentation:
- `SYNC_WORKFLOW.md` - Complete workflow guide
- `AUTOMATED_SYNC_GUIDE.md` - Advanced automation options
- `.bolt-sync-config.json` - Sync configuration
