#!/bin/bash

echo "🚀 Starting Databento Live Service (Local Mode)"
echo "=============================================="

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Copy .env.example to .env and configure it"
    exit 1
fi

source .env

if [ -z "$DATABENTO_API_KEY" ]; then
    echo "❌ Error: DATABENTO_API_KEY not set in .env"
    exit 1
fi

if [ -z "$SUPABASE_URL" ]; then
    echo "❌ Error: SUPABASE_URL not set in .env"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set in .env"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "✅ API Key: ${DATABENTO_API_KEY:0:8}...${DATABENTO_API_KEY: -4}"
echo "✅ Supabase: $SUPABASE_URL"
echo ""
echo "🎬 Starting service..."
echo ""

python3 src/main.py
