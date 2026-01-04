#!/bin/bash

# Sync from Bolt - Download, Extract, and Update Local Files
# Usage: ./sync-from-bolt.sh <path-to-bolt-download.zip>

BOLT_ZIP="$1"

if [ -z "$BOLT_ZIP" ]; then
    echo "❌ Error: Please provide path to Bolt download zip"
    echo "Usage: ./sync-from-bolt.sh <path-to-bolt-download.zip>"
    exit 1
fi

if [ ! -f "$BOLT_ZIP" ]; then
    echo "❌ Error: File not found: $BOLT_ZIP"
    exit 1
fi

echo "🔄 Starting Bolt sync process..."

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "📦 Extracting Bolt project..."

# Extract zip
unzip -q "$BOLT_ZIP" -d "$TEMP_DIR"

# Find the extracted project folder
SOURCE_PATH=$(find "$TEMP_DIR" -maxdepth 1 -type d ! -path "$TEMP_DIR" | head -1)

if [ -z "$SOURCE_PATH" ]; then
    echo "❌ Error: Could not find extracted folder"
    exit 1
fi

echo "🔍 Comparing files..."

# Files and folders to exclude
EXCLUDE_PATTERNS=(
    ".git"
    ".env"
    ".env.local"
    "node_modules"
    ".next"
    "*.md"
    "*.log"
)

# Build rsync exclude options
EXCLUDE_OPTS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_OPTS="$EXCLUDE_OPTS --exclude=$pattern"
done

# Sync files
rsync -av --progress $EXCLUDE_OPTS "$SOURCE_PATH/" ./ | tee /tmp/sync-log.txt

FILES_COPIED=$(grep -c "^[^/]*$" /tmp/sync-log.txt || echo "0")

echo ""
echo "✅ Sync complete!"
echo "   📝 Files synced: Check git status for details"
echo ""
echo "📋 Next steps:"
echo "   1. Review changes: git status"
echo "   2. Test locally: npm run dev"
echo "   3. Commit: git add . && git commit -m 'Sync from Bolt'"
echo "   4. Push: git push origin main"
