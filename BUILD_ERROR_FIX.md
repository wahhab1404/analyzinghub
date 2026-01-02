# Build Error Fix - Supabase Service Role Client Initialization

## Issue

Netlify build was failing with:
```
Error: supabaseKey is required.
    at new ej (/opt/build/repo/.next/server/chunks/6133.js:4:38834)
> Build error occurred
Error: Failed to collect page data for /api/scoring/award
```

## Root Cause

Three service classes were creating Supabase clients at **module level** (during import):

1. **`services/scoring/scoring.service.ts`**
   - Lines 3-4: Accessed `process.env.SUPABASE_SERVICE_ROLE_KEY` at module level
   - Constructor created Supabase client immediately
   - Line 458: Exported singleton instance `export const scoringService = new ScoringService()`

2. **`services/scoring/badge.service.ts`**
   - Lines 3-4: Accessed `process.env.SUPABASE_SERVICE_ROLE_KEY` at module level
   - Constructor created Supabase client immediately
   - Line 231: Exported singleton instance `export const badgeService = new BadgeService()`

3. **`services/telegram/telegram.service.ts`**
   - Constructor (lines 22-31): Accessed env vars and threw error if missing
   - Line 161: Exported singleton instance `export const telegramService = new TelegramService()`

When Next.js builds and analyzes API routes, it imports these services, triggering their constructors. Since `SUPABASE_SERVICE_ROLE_KEY` was removed from `netlify.toml` (for security), it's not available at BUILD time, causing the error.

## Solution

Refactored all three services to use **lazy initialization**:

### Before (Problematic Pattern)
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export class ScoringService {
  private supabase: ReturnType<typeof createClient>

  constructor() {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey)
  }
}

export const scoringService = new ScoringService()
```

### After (Fixed Pattern)
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export class ScoringService {
  private getClient(): SupabaseClient {
    return createServiceRoleClient()
  }

  private get supabase(): SupabaseClient {
    return this.getClient()
  }
}

export const scoringService = new ScoringService()
```

## Key Changes

1. **Removed module-level environment variable access**
   - No `process.env` access during module import

2. **Used lazy getter pattern**
   - `private get supabase()` creates client only when accessed
   - Client is created on-demand at runtime, not at build time

3. **Used `createServiceRoleClient()` helper**
   - Centralized service role client creation
   - Proper error handling with clear messages
   - Already uses `server-only` import guard

## Files Changed

- ✅ `services/scoring/scoring.service.ts`
- ✅ `services/scoring/badge.service.ts`
- ✅ `services/telegram/telegram.service.ts`

## Build Result

✅ **Build now succeeds**

```
 ✓ Generating static pages (41/41)
   Finalizing page optimization...

Route (app)                                       Size     First Load JS
...
├ λ /api/scoring/award                            0 B                0 B
...
```

## Next Steps for Deployment

After this fix, you still need to:

### 1. Configure Runtime Environment Variables

Follow `NETLIFY_ENV_CHECKLIST.md` to:
- Add all environment variables to Netlify Dashboard
- Rotate exposed secrets
- Deploy with clear cache

### 2. Why This Fix Works

**Build Time vs Runtime:**

| Phase | Environment Variables Available |
|-------|--------------------------------|
| **Build Time** | Only from `netlify.toml` `[build.environment]` |
| **Runtime (Functions)** | From Netlify Dashboard + `netlify.toml` |

**The Problem:**
- Services were trying to create Supabase clients during BUILD
- `SUPABASE_SERVICE_ROLE_KEY` removed from `netlify.toml` for security
- Not available at build time → Error

**The Solution:**
- Services now create clients at RUNTIME (when methods are called)
- Environment variables are available at runtime from Netlify Dashboard
- No module-level initialization → No build-time errors

### 3. Verify After Deployment

```bash
# Test that build succeeds on Netlify
# (Check build logs for successful completion)

# After deployment, test API endpoints
curl https://anlzhub.com/api/debug/env-check
curl https://anlzhub.com/api/stock-price?symbol=AAPL
```

## Security Notes

This fix **requires** that `SUPABASE_SERVICE_ROLE_KEY` is configured in Netlify Dashboard, not in code.

**Important:**
1. Never commit `SUPABASE_SERVICE_ROLE_KEY` to Git
2. Only store in Netlify Dashboard → Environment variables
3. Rotate the key after it was exposed in `netlify.toml`
4. Keep secrets in Netlify Dashboard only

## Summary

The build failure was caused by services trying to access environment variables during module initialization at build time. The fix changes these services to lazy-load Supabase clients at runtime when methods are actually called, not when the module is imported.

**Status:** ✅ Build error fixed. Deployment will succeed once environment variables are configured in Netlify Dashboard.
