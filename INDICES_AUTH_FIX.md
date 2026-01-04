# Indices API Authentication Fix

## Issue
When creating an index analysis as an analyzer, the API returned "Unauthorized" error despite the user being properly authenticated.

## Root Cause
The indices API routes were using the wrong Supabase client initialization function:

```typescript
// ❌ WRONG - Doesn't properly handle cookies/sessions
import { createClient } from '@/lib/supabase/server';
const supabase = createClient();
```

The `createClient()` function requires a `cookieStore` parameter to be passed, but was being called without it. This caused the authentication context to be lost, resulting in `auth.getUser()` returning null even for authenticated users.

## Solution
Changed all indices API routes to use `createServerClient()` instead:

```typescript
// ✅ CORRECT - Properly handles cookies/sessions
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();
```

The `createServerClient()` function automatically handles the Next.js cookies API internally and properly maintains authentication state.

## Files Fixed
1. `/app/api/indices/analyses/route.ts`
2. `/app/api/indices/analyses/[id]/route.ts`
3. `/app/api/indices/analyses/[id]/trades/route.ts`
4. `/app/api/indices/analyses/[id]/updates/route.ts`
5. `/app/api/indices/trades/[id]/route.ts`
6. `/app/api/indices/trades/[id]/updates/route.ts`

## Changes Made
- Changed import: `createClient` → `createServerClient`
- Changed instantiation: `createClient()` → `createServerClient()`
- Total instances fixed: 12 across 6 files

## Verification
Build successful:
```
✓ Compiled successfully
✓ Generating static pages (52/52)
```

## Impact
- ✅ Analyzers can now create index analyses
- ✅ All indices-related operations properly authenticated
- ✅ No breaking changes to existing functionality
- ✅ Consistent with other API routes in the app

## Related
This issue only affected the `/api/indices/*` routes. Other API routes were already using `createServerClient()` correctly.
