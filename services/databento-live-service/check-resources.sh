#!/bin/bash
echo "=== Checking Fly.io resource usage ==="
echo ""
echo "All apps:"
fly apps list
echo ""
echo "All machines (stopped and running):"
fly machines list --all
echo ""
echo "=== Solutions ==="
echo "1. Destroy unused apps: fly apps destroy <app-name>"
echo "2. Stop machines: fly machine stop <machine-id>"
echo "3. Add payment method: fly orgs billing"
