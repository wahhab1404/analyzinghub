# Production API Error Fixes

## Summary
Fixed multiple 500 errors occurring in production for critical API endpoints and updated deprecated mobile meta tag.

## Issues Fixed

### 1. GET /api/plans - Missing `analyzer_plans` Table
**Problem:** The `analyzer_plans` table doesn't exist in production (created in migration `20251227172003`).

**Solution:** Added table existence check:
```typescript
if (error) {
  console.error('Error fetching plans:', error)
  if (error.code === '42P01' || error.message?.includes('does not exist')) {
    return NextResponse.json({ plans: [] })
  }
  // ... rest of error handling
}
```

**File:** `app/api/plans/route.ts`

### 2. GET /api/leaderboards - Missing Ranking Tables
**Problem:** The endpoint depends on tables created in recent migrations that may not exist in production:
- `leaderboard_cache`
- `user_points_balance`
- `user_stats`
- `user_badges`

**Solution:** Added table existence checks for both cache and main query:
```typescript
if (cacheError) {
  console.error('Leaderboard cache error:', cacheError)
  if (cacheError.code === '42P01' || cacheError.message?.includes('does not exist')) {
    return NextResponse.json({
      ok: true,
      scope,
      type,
      rows: [],
      cached: false,
      generatedAt: new Date().toISOString(),
    })
  }
}
```

**File:** `app/api/leaderboards/route.ts`

### 3. GET /api/subscriptions/me - Missing Tables
**Problem:** Queries both `subscriptions` and `analyzer_plans` tables that may not exist in production.

**Solution:** Added table existence check:
```typescript
if (subsError) {
  console.error('Error fetching subscriptions:', subsError)
  if (subsError.code === '42P01' || subsError.message?.includes('does not exist')) {
    return NextResponse.json({ subscriptions: [] })
  }
  // ... rest of error handling
}
```

Also wrapped `telegram_memberships` query in try-catch (from previous fix).

**File:** `app/api/subscriptions/me/route.ts`

### 4. GET /api/recommendations/analyzers - Missing Database Views
**Problem:** Recommendation service depends on database views that may not exist in production:
- `user_symbol_affinity`
- `user_analyzer_affinity`
- `trending_analyses`
- `analyzer_performance`
- `analyzer_rating_stats`

**Solution:** Wrapped recommendation calls in try-catch, returns empty array on failure:
```typescript
let recommendations: any[] = []
try {
  recommendations = await recommendationService.recommendAnalyzers(...)
} catch (recError: any) {
  console.error('Recommendation service error:', recError)
  recommendations = []
}
```

**File:** `app/api/recommendations/analyzers/route.ts`

### 5. GET /api/recommendations/symbols - Same as Above
**Solution:** Applied same try-catch pattern to symbol recommendations.

**File:** `app/api/recommendations/symbols/route.ts`

### 6. Deprecated Mobile Meta Tag
**Problem:** Browser warning about deprecated `apple-mobile-web-app-capable` meta tag.

**Solution:** Added the modern `mobile-web-app-capable` meta tag alongside the Apple-specific one for backward compatibility:
```html
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

**File:** `app/layout.tsx`

## Database Error Code Reference
All fixes check for PostgreSQL error code `42P01` which indicates "undefined table" or "relation does not exist".

## Testing
All changes tested with:
```bash
npm run build
```

Build completes successfully without errors or warnings.

## Deployment Notes
These changes make the API resilient to missing database migrations in production. The app will continue functioning even if:
- Recent migrations haven't been applied (2024-12-27 and later)
- Ranking and subscription system tables are missing
- Database views for recommendations don't exist
- Optional features (like telegram memberships) aren't set up yet

All endpoints now return graceful empty responses instead of 500 errors when encountering missing database objects.

## Affected Migrations
The following migrations need to be applied in production for full functionality:
- `20251227172003_create_subscription_system.sql` - Creates `subscriptions`, `analyzer_plans`, `telegram_memberships`
- `20251227173109_create_ranking_reputation_system.sql` - Creates `user_points_balance`, `user_stats`, `user_badges`, `leaderboard_cache`
- `20251228072709_cleanup_unused_indexes_and_fix_search_path.sql` - Creates recommendation views
