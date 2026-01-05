#!/bin/bash
set -e

echo "🚀 DEPLOYING DATABENTO LIVE SERVICE TO FLY.IO"
echo "=============================================="

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Installing..."
    curl -L https://fly.io/install.sh | sh
    export FLYCTL_INSTALL="/root/.fly"
    export PATH="$FLYCTL_INSTALL/bin:$PATH"
fi

echo "✅ Fly CLI ready"

cd "$(dirname "$0")"

# Check if app exists
if ! fly status -a databento-live-service 2>/dev/null; then
    echo "📦 Creating new Fly.io app..."
    fly apps create databento-live-service --region iad
fi

echo "🔐 Setting secrets..."
fly secrets set \
  DATABENTO_API_KEY="db-DiedQk3PdYRE4Dr5njjxeyHN7c3es" \
  SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8" \
  -a databento-live-service

echo "🚢 Deploying to Fly.io..."
fly deploy -a databento-live-service

echo "✅ Deployment complete!"
echo ""
echo "📊 View logs:"
echo "   fly logs -a databento-live-service"
echo ""
echo "🔍 Check status:"
echo "   fly status -a databento-live-service"
echo ""
echo "🌐 Service should be streaming live prices now!"
