#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Databento Live Service"
echo "=========================================="
echo ""
echo "Updated dependencies:"
echo "  - supabase: 2.3.4 → 2.9.0 (fixes proxy error)"
echo ""
echo "Deploying with --no-cache to force rebuild..."
echo ""

fly deploy -a databento-live-svc --no-cache

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Monitor logs with:"
echo "  fly logs -a databento-live-svc"
