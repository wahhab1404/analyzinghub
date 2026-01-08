#!/bin/bash

# Fix Databento Live Service - Set Missing Environment Variables
# This script sets the required secrets in Fly.io

set -e

echo "=========================================="
echo "Fixing Databento Live Service Secrets"
echo "=========================================="
echo ""

# Check if flyctl is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Error: flyctl is not installed"
    echo "Install it from: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged into Fly.io"
    echo "Run: fly auth login"
    exit 1
fi

echo "✅ Fly CLI ready"
echo ""

# Load values from parent .env file
ENV_FILE="../.env"
if [ -f "$ENV_FILE" ]; then
    echo "📄 Loading values from $ENV_FILE"
    source "$ENV_FILE"
else
    echo "⚠️  Warning: ../.env file not found, will use manual input"
fi

echo ""
echo "Setting secrets for app: databento-live-svc"
echo ""

# Set DATABENTO_API_KEY
if [ -z "$DATABENTO_API_KEY" ]; then
    echo "❌ DATABENTO_API_KEY not found in .env"
    read -p "Enter DATABENTO_API_KEY: " DATABENTO_API_KEY
fi
echo "Setting DATABENTO_API_KEY..."
fly secrets set DATABENTO_API_KEY="$DATABENTO_API_KEY" -a databento-live-svc

# Set SUPABASE_URL
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo "❌ SUPABASE_URL not found in .env"
    read -p "Enter SUPABASE_URL: " SUPABASE_URL
else
    SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
fi
echo "Setting SUPABASE_URL..."
fly secrets set SUPABASE_URL="$SUPABASE_URL" -a databento-live-svc

# Set SUPABASE_SERVICE_ROLE_KEY
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env"
    read -p "Enter SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY
fi
echo "Setting SUPABASE_SERVICE_ROLE_KEY..."
fly secrets set SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" -a databento-live-svc

echo ""
echo "=========================================="
echo "✅ Secrets set successfully!"
echo "=========================================="
echo ""
echo "The app will automatically restart with the new secrets."
echo ""
echo "To verify the service is running:"
echo "  fly logs -a databento-live-svc"
echo ""
echo "To check app status:"
echo "  fly status -a databento-live-svc"
echo ""
