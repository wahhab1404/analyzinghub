# Render Deployment Fix - TypeScript Build Error

## Problem
The deployment was failing with:
```
error TS7016: Could not find a declaration file for module 'express'
```

## Root Cause
The `render.yaml` had `NODE_ENV=production` set as an environment variable during build time, which caused npm to skip installing devDependencies (TypeScript, @types/express, etc.).

## Solution Applied
Updated `render.yaml` to:
1. Use `npm ci && npm run build` for reproducible builds
2. Only set `NODE_ENV=production` in the start command, NOT during build

### Changes Made to render.yaml
```yaml
# BEFORE (Broken):
buildCommand: npm install && npm run build
startCommand: npm run websocket
envVars:
  - key: NODE_ENV
    value: production

# AFTER (Fixed):
buildCommand: npm ci && npm run build
startCommand: NODE_ENV=production npm run websocket
envVars:
  # NODE_ENV removed from here - only set at runtime
```

## Next Steps

### Once Changes Are Pushed to GitHub:
Render will automatically detect the new commit and redeploy. The build should succeed.

### Manual Deployment (If Needed):
If you need to deploy manually via Render Dashboard:

1. Go to your Render dashboard
2. Find the `indices-websocket-service`
3. Click "Settings"
4. Update the build command to:
   ```
   npm ci && npm run build
   ```
5. Update the start command to:
   ```
   NODE_ENV=production npm run websocket
   ```
6. Remove `NODE_ENV` from environment variables if it exists
7. Click "Manual Deploy" → "Deploy latest commit"

### Environment Variables Required:
Make sure these are set in Render Dashboard:
- `POLYGON_API_KEY` - Your Polygon.io API key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `NEXT_PUBLIC_SUPABASE_URL` - Already set to https://gbdzhdlpbwrnhykmstic.supabase.co

## Testing Locally
To verify the fix works:
```bash
cd realtime-pricing-service
rm -rf node_modules
npm ci
npm run build
```

This should build successfully without any TypeScript errors.

## Why This Fix Works
- **Build phase**: All dependencies (including dev) are installed → TypeScript compiles successfully
- **Runtime phase**: NODE_ENV=production optimizes the running service → No devDependencies needed
