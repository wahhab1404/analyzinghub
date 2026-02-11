# Authentication Fix for Testing Channels API

## Problem
The `/api/testing/channels` endpoints were returning 401 Unauthorized errors because of TWO issues:

### Issue 1: Client-Side - Missing Credentials
Fetch requests were not sending credentials (cookies) with requests. In credentialless WebContainer domains, cookies are not sent automatically unless explicitly included.

### Issue 2: Server-Side - Incorrect Cookie Store Usage
API route handlers were calling `createClient()` incorrectly:
- **WRONG:** `const supabase = await createClient()`
- **RIGHT:** `const supabase = createClient(await cookies())`

The `createClient()` function requires a `cookieStore` parameter to read session cookies. Without it, no user session could be found.

## Solution Implemented

### 1. Created Client-Side API Helper Library
**File:** `/lib/api-client.ts`

Added a reusable API helper that:
- Automatically includes `credentials: 'include'` in all fetch requests
- Properly sets Content-Type headers
- Provides typed helper functions: `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`
- Throws `ApiError` with proper status codes for easy error handling
- Handles 401 responses gracefully

```typescript
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',  // ← Critical for credentialless domains
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  // ... error handling
}
```

### 2. Updated TestingChannelsSettings Component
**File:** `/components/settings/TestingChannelsSettings.tsx`

Replaced all direct `fetch()` calls with the new API helpers:

**Before:**
```typescript
const response = await fetch('/api/testing/channels')
if (response.status === 401) {
  console.log('Not authenticated')
  return
}
const data = await response.json()
```

**After:**
```typescript
try {
  const data = await apiGet<{ channels: TestingChannel[] }>('/api/testing/channels')
  setChannels(data.channels || [])
} catch (error) {
  if (error instanceof ApiError && error.status === 401) {
    console.log('Not authenticated')
    return
  }
  // Handle other errors
}
```

### 3. Fixed API Route Cookie Store Usage
**Files:**
- `/app/api/testing/channels/route.ts`
- `/app/api/testing/channels/verify/route.ts`
- `/app/api/testing/channels/[id]/route.ts`

Updated all route handlers to properly pass the cookie store:

**Before (BROKEN):**
```typescript
export async function GET() {
  const supabase = await createClient()  // ❌ Wrong - no cookies!
  const { data: { user } } = await supabase.auth.getUser()
  // user is always null
}
```

**After (FIXED):**
```typescript
export async function GET() {
  const cookieStore = await cookies()  // ✅ Get the cookie store
  const supabase = createClient(cookieStore)  // ✅ Pass it to createClient
  const { data: { user } } = await supabase.auth.getUser()
  // user is properly retrieved from session cookies
}
```

### 4. Added Debugging Logs

Added comprehensive logging to track authentication issues:
```typescript
const allCookies = cookieStore.getAll()
console.log('[GET /api/testing/channels] Cookies present:', allCookies.length)
console.log('[GET /api/testing/channels] Cookie names:', allCookies.map(c => c.name).join(', '))

const { data: { user }, error: authError } = await supabase.auth.getUser()

if (authError) {
  console.error('[GET /api/testing/channels] Auth error:', authError)
}

if (!user) {
  console.log('[GET /api/testing/channels] No user found in session')
} else {
  console.log('[GET /api/testing/channels] User authenticated:', user.id)
}
```

## Benefits

1. **Consistent Authentication**: All API calls now use the same pattern with proper credential handling
2. **Better Error Handling**: Structured error handling with typed errors
3. **Easier Debugging**: Console logs help identify auth issues quickly
4. **Reusable**: The API client can be used across the entire application
5. **Type Safety**: TypeScript support for request/response types
6. **Clean Code**: Reduces boilerplate in components

## Usage Examples

### GET Request
```typescript
const data = await apiGet<{ channels: TestingChannel[] }>('/api/testing/channels')
```

### POST Request
```typescript
const result = await apiPost('/api/testing/channels', {
  name: 'Test Channel',
  telegram_channel_id: '-1001234567890'
})
```

### Error Handling
```typescript
try {
  await apiDelete(`/api/testing/channels/${id}`)
} catch (error) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      toast.error('You must be logged in')
    } else {
      toast.error(error.message)
    }
  }
}
```

## Testing
- Build completed successfully ✓
- All fetch calls updated to use new API helpers ✓
- Proper credential handling for WebContainer environments ✓
- Structured error handling implemented ✓

## Important: Other API Routes Need Similar Fixes

The following API routes were identified with the same cookie store issue:
- `/api/telegram/ad-channels/route.ts`
- `/api/indices/trades/manual/route.ts`
- `/api/companies/trades/route.ts`
- `/api/companies/trades/[id]/route.ts`
- `/api/companies/trades/check-existing/route.ts`

These routes should be updated using the same pattern:
```typescript
// Add import
import { cookies } from 'next/headers'

// In handler function
const cookieStore = await cookies()
const supabase = createClient(cookieStore)
```

## Next Steps

### For Frontend Components:
1. Import the API client: `import { apiGet, apiPost, ... } from '@/lib/api-client'`
2. Replace direct `fetch()` calls with the appropriate helper function
3. Handle `ApiError` exceptions appropriately

### For Backend API Routes:
1. Import `cookies` from `next/headers`
2. Call `const cookieStore = await cookies()` at the start of each handler
3. Pass `cookieStore` to `createClient(cookieStore)`

## Authentication Strategy

The application uses **session-based authentication with HTTP-only cookies**:
- Supabase handles session management
- Cookies are automatically included with `credentials: 'include'`
- Works in both standard and credentialless preview environments
- No bearer tokens needed for most requests
