#!/bin/bash

echo "🚀 Starting Polygon WebSocket Real-Time Streaming Service"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Kill any existing instances
pkill -f "polygon-websocket" 2>/dev/null || true
sleep 1

echo "✅ Environment loaded"
echo "✅ Starting WebSocket service..."
echo ""
echo "📊 This service will:"
echo "  - Connect to Polygon WebSocket API"
echo "  - Subscribe to all active trades"
echo "  - Update prices in real-time"
echo "  - Auto-reconnect on disconnect"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "=========================================="
echo ""

# Run the service
npx ts-node src/polygon-websocket.ts
