#!/bin/bash

set -e

echo "🚀 Deploying Polygon WebSocket Service to Fly.io"
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please login to Fly.io first:"
    fly auth login
fi

cd "$(dirname "$0")"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if app exists
if fly status &> /dev/null; then
    echo "✅ App exists, deploying update..."
    fly deploy --dockerfile Dockerfile.websocket
else
    echo "🆕 Creating new app..."
    fly launch \
        --name indices-hub-websocket \
        --region iad \
        --dockerfile Dockerfile.websocket \
        --no-deploy

    echo ""
    echo "⚙️  Now set your secrets:"
    echo ""
    echo "fly secrets set \\"
    echo "  POLYGON_API_KEY=your_key \\"
    echo "  NEXT_PUBLIC_SUPABASE_URL=https://gbdzhdlpbwrnhykmstic.supabase.co \\"
    echo "  SUPABASE_SERVICE_ROLE_KEY=your_key"
    echo ""
    echo "Then run: fly deploy --dockerfile Dockerfile.websocket"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Check status: fly status"
echo "📝 View logs:    fly logs"
echo "🔧 SSH access:   fly ssh console"
