#!/bin/bash

# Quick check for active trades using curl
SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8"

echo "Checking for active trades..."
curl -s "${SUPABASE_URL}/rest/v1/index_trades?status=eq.active&select=id,polygon_option_ticker,polygon_underlying_index_ticker" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" | jq '.'
