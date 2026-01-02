# Packages System Testing Checklist

This document provides a comprehensive testing checklist for the new Packages (Platform Plans) system implemented in Analyzing Hub.

## Overview

The platform now supports four package tiers:
- **Free Trader** ($0/month) - Default for all users
- **Pro Trader** (Coming Soon) - Advanced trading features
- **Analyzer Pro** (Coming Soon) - For professional analysts
- **Analyzer Elite** (Invitation Only) - Premium analyst features

---

## 1. Database & Schema Tests

### ✅ Tables Created
- [ ] `platform_packages` - Verify 4 packages exist (free_trader, pro_trader, analyzer_pro, analyzer_elite)
- [ ] `package_features` - Verify 13 features defined
- [ ] `package_feature_map` - Verify all packages have feature mappings
- [ ] `user_entitlements` - Check table structure and RLS policies
- [ ] `user_entitlement_audit` - Verify audit trail works
- [ ] `user_limits_cache` - Performance cache for entitlements
- [ ] `user_role_audit` - Role change audit trail
- [ ] `analysis_edits_audit` - Edit history tracking
- [ ] `analysis_followups` - Live updates table
- [ ] `symbol_watchlists` - Symbol following for Pro+ traders

### ✅ RLS Policies
- [ ] Public can view active, public packages
- [ ] Admins can view/modify all package data
- [ ] Users can only view their own entitlements
- [ ] Only admins can assign/modify entitlements
- [ ] Audit tables are admin-only read
- [ ] Analysis edits visible to owner and public for public analyses
- [ ] Live updates respect access rules (Pro+ for SPX/NDX)
- [ ] Symbol watchlists gated to Pro+ users

### ✅ Triggers & Functions
- [ ] `refresh_user_limits_cache()` - Updates cache correctly
- [ ] Cache refreshes on entitlement change
- [ ] Cache refreshes on profile/role change
- [ ] Default to free_trader if no entitlement exists

---

## 2. Entitlements Service Tests

### ✅ getUserEntitlements()
- [ ] Returns correct entitlements for user with assigned package
- [ ] Defaults to free_trader for users without entitlement
- [ ] Returns null gracefully on error
- [ ] Cache is up-to-date after changes

### ✅ Follow Limit Enforcement
- [ ] **Free Trader**: Cannot follow more than 50 analyzers
- [ ] **Pro Trader+**: Unlimited follows work correctly
- [ ] API returns proper error with limit info when exceeded
- [ ] Unfollowing works and doesn't count against limit

**Test SQL:**
```sql
-- Check current follows count
SELECT COUNT(*) FROM follows WHERE follower_id = '<user_id>';

-- Check user's follow limit
SELECT follow_analyzers_limit FROM user_limits_cache WHERE user_id = '<user_id>';
```

### ✅ Publishing Limit Enforcement
- [ ] **Free Trader**: Cannot publish analyses
- [ ] **Pro Trader**: Cannot publish analyses
- [ ] **Analyzer Pro**: Can publish up to 20 analyses per day
- [ ] **Analyzer Elite**: Unlimited publishing works
- [ ] Daily limit resets at midnight
- [ ] API returns proper error when limit reached

**Test SQL:**
```sql
-- Check today's publish count
SELECT COUNT(*) FROM analyses
WHERE analyzer_id = '<user_id>'
AND created_at >= CURRENT_DATE;
```

### ✅ Symbol Watchlist Enforcement
- [ ] **Free Trader**: Cannot add symbols to watchlist
- [ ] **Pro Trader+**: Can add/remove symbols from watchlist
- [ ] API returns upgrade prompt when feature locked

### ✅ Live Index Updates
- [ ] **Free Trader**: Cannot view SPX/NDX live updates
- [ ] **Pro Trader+**: Can view live index feeds
- [ ] **Analyzer Pro/Elite**: Can post live index updates
- [ ] RLS policies enforce access correctly

### ✅ Telegram Channels Limit
- [ ] **Free Trader**: 0 channels allowed
- [ ] **Pro Trader**: 0 channels allowed
- [ ] **Analyzer Pro**: Up to 2 channels
- [ ] **Analyzer Elite**: Up to 4 channels
- [ ] Cannot exceed channel limit

### ✅ Other Feature Gates
- [ ] `can_export` - Export feature locked for Free Trader
- [ ] `can_telegram_alerts` - Alerts locked for Free Trader
- [ ] `can_edit_5min` - Edit window only for Analyzer Pro/Elite
- [ ] `can_extended_targets` - Extended targets only for Analyzer Pro/Elite
- [ ] `can_live_analysis_mode` - Live mode only for Analyzer Pro/Elite
- [ ] `has_elite_badge` - Elite badge only for Analyzer Elite
- [ ] `has_private_support` - Private support only for Elite

---

## 3. API Endpoint Tests

### ✅ GET /api/me/entitlements
- [ ] Returns current user's entitlements
- [ ] Requires authentication
- [ ] Returns 401 for unauthenticated requests

### ✅ POST /api/admin/users/:id/entitlements
- [ ] Admin can assign packages to users
- [ ] Creates audit trail entry
- [ ] Refreshes user's limits cache
- [ ] Requires admin role
- [ ] Returns 403 for non-admins
- [ ] Validates package_key exists

### ✅ GET /api/admin/users/:id/entitlements
- [ ] Returns user's current entitlement
- [ ] Returns audit history (last 10 records)
- [ ] Requires admin role
- [ ] Returns 403 for non-admins

### ✅ POST /api/follow (Updated)
- [ ] Checks entitlement before allowing follow
- [ ] Returns structured error when limit reached:
  ```json
  {
    "ok": false,
    "error": "FOLLOW_LIMIT_REACHED",
    "limit": 50,
    "current": 50,
    "upgradePackage": "pro_trader"
  }
  ```
- [ ] Unfollowing still works without limit check

### ✅ POST /api/analyses/:id/edit
- [ ] Only works within 5 minutes of publish
- [ ] Requires Analyzer Pro/Elite package
- [ ] Requires edit_note field
- [ ] Creates audit record in `analysis_edits_audit`
- [ ] Sets `is_edited=true` and `last_edited_at`
- [ ] Returns 403 after 5-minute window expires
- [ ] Returns 403 for users without entitlement

**Test Scenario:**
1. Create analysis as Analyzer Pro user
2. Within 5 minutes: Edit should succeed
3. After 5 minutes: Edit should fail with "EDIT_WINDOW_EXPIRED"
4. Verify audit record created

### ✅ POST /api/analyses/:id/extended-targets
- [ ] Requires Analyzer Pro/Elite package
- [ ] Adds target to `extended_targets` jsonb array
- [ ] Requires price and label
- [ ] Only owner can add extended targets
- [ ] Returns 403 for users without entitlement

### ✅ GET /api/analyses/:id/extended-targets
- [ ] Returns extended targets for any user
- [ ] Returns empty array if none exist

### ✅ POST /api/live-updates
- [ ] Requires Analyzer Pro/Elite package
- [ ] Validates type: analysis_update, spx_live, ndx_live
- [ ] Creates record in `analysis_followups`
- [ ] Requires content field
- [ ] Returns 403 for users without entitlement

### ✅ GET /api/live-updates
- [ ] Filters by type (optional)
- [ ] Filters by analysis_id (optional)
- [ ] Enforces Pro+ entitlement for spx_live/ndx_live types
- [ ] Returns proper error for users without entitlement
- [ ] Respects RLS for analysis-tied updates

---

## 4. UI/UX Tests

### ✅ Pricing Page (/pricing)
- [ ] Displays all 4 packages correctly
- [ ] Shows features for each package
- [ ] "Pro Trader" highlighted as popular
- [ ] CTAs work correctly:
  - Free Trader → /register
  - Others → "Coming soon" alert
- [ ] Responsive design works on mobile

### ✅ Package Badges (Future)
- [ ] User profile shows current package badge
- [ ] Elite badge displayed for Analyzer Elite users
- [ ] Package name visible in settings

### ✅ Feature Locks (Future UI Work)
- [ ] Locked features show upgrade prompt
- [ ] Clear messaging about which package unlocks feature
- [ ] "Upgrade" button directs to pricing page
- [ ] Never fails silently - always show lock state

### ✅ Navigation & Gating (Future)
- [ ] "Create Analysis" only visible for Analyzer role + Analyzer Pro/Elite package
- [ ] Symbol watchlist feature only accessible for Pro+ users
- [ ] Export buttons hidden/locked for Free Trader
- [ ] Live index feed section gated to Pro+ users

---

## 5. Admin Panel Tests (Future Implementation)

### ✅ User Management
- [ ] Search and view all users
- [ ] View user's current package and entitlements
- [ ] Assign/upgrade/downgrade packages
- [ ] Set expiration dates for packages
- [ ] Add notes/reasons for package changes
- [ ] View entitlement audit history
- [ ] Change user roles (with proper permissions)

### ✅ Package Management
- [ ] View all packages
- [ ] Activate/deactivate packages
- [ ] Control public visibility
- [ ] Edit package descriptions
- [ ] View feature mappings
- [ ] Modify feature limits (advanced)

### ✅ Audit & Reporting
- [ ] View package distribution across users
- [ ] View recent entitlement changes
- [ ] View role changes
- [ ] Export audit logs

---

## 6. Security Tests

### ✅ Server-Side Enforcement
- [ ] All entitlement checks happen server-side
- [ ] Client cannot bypass limits by API manipulation
- [ ] RLS policies prevent unauthorized access
- [ ] Admin-only operations require proper role check

### ✅ Audit Trail
- [ ] All package changes logged in `user_entitlement_audit`
- [ ] All role changes logged in `user_role_audit`
- [ ] All analysis edits logged in `analysis_edits_audit`
- [ ] Audit records include performer ID and timestamp

### ✅ No Privilege Escalation
- [ ] Admins cannot self-assign super_admin role
- [ ] Regular admins have limited scope (no Elite assignment)
- [ ] Service role used appropriately for system operations

---

## 7. Edge Cases & Error Handling

### ✅ Missing Entitlements
- [ ] New users default to free_trader
- [ ] System handles users without entitlement record
- [ ] Cache populates on first access

### ✅ Expired Entitlements
- [ ] System respects expires_at field
- [ ] Expired entitlements treated as inactive
- [ ] Users revert to free_trader when expired

### ✅ Suspended Entitlements
- [ ] status='suspended' treated as no entitlement
- [ ] Can be resumed by admin
- [ ] Audit trail tracks suspension/resumption

### ✅ Role Changes
- [ ] Changing from trader to analyzer updates cache
- [ ] Changing from analyzer to trader prevents publishing
- [ ] Cache refreshes automatically on role change

### ✅ API Error Responses
- [ ] Clear error messages
- [ ] Include upgradePackage hint where applicable
- [ ] Include current/limit values for limit errors
- [ ] Proper HTTP status codes (403 for forbidden, 401 for unauthorized)

---

## 8. Performance Tests

### ✅ Caching
- [ ] Entitlements cached in `user_limits_cache`
- [ ] Cache used instead of recalculating each time
- [ ] Cache updates within 1 second of entitlement change
- [ ] No N+1 query problems in entitlement checks

### ✅ Database Indexes
- [ ] Follow count queries perform well (index on follower_id)
- [ ] Today's analysis count queries perform well
- [ ] Telegram channel count queries perform well
- [ ] Audit queries perform well with created_at index

---

## 9. Regression Tests

### ✅ Existing Features Still Work
- [ ] User registration/login unchanged
- [ ] Analysis creation still works (for analyzers with entitlement)
- [ ] Following/unfollowing works correctly
- [ ] Comments, likes, reposts function normally
- [ ] Notifications still fire
- [ ] Telegram integration unchanged
- [ ] Search functionality works
- [ ] Rankings/leaderboard operational
- [ ] Analyst subscriptions (separate from platform packages) still work

---

## 10. Manual Test Scenarios

### Scenario 1: Free Trader Journey
1. Register new user (defaults to Free Trader)
2. Verify can browse public analyses
3. Follow 50 analyzers successfully
4. Try to follow 51st analyzer → Should fail with limit error
5. Try to create analysis → Should fail (not analyzer role)
6. Try to add symbol to watchlist → Should fail with upgrade prompt
7. Try to view live SPX feed → Should fail with upgrade prompt

### Scenario 2: Analyzer Pro Upgrade
1. Admin assigns Analyzer Pro to existing trader
2. Change user role to analyzer
3. Verify cache refreshes
4. User can now create analyses (up to 20/day)
5. Create 20 analyses successfully
6. Try to create 21st → Should fail with daily limit error
7. Wait until next day → Limit resets, can create again
8. Test 5-minute edit window works
9. Test extended targets feature works
10. Test live analysis mode works

### Scenario 3: Analyzer Elite Features
1. Admin assigns Analyzer Elite to analyzer user
2. Verify unlimited publishing works (create 25+ analyses)
3. Test Elite badge appears
4. Connect up to 4 Telegram channels successfully
5. Try to connect 5th channel → Should fail with limit error
6. Verify private support access

### Scenario 4: Admin Package Management
1. Login as super_admin
2. Navigate to Users page
3. Search for specific user
4. View current entitlement and audit history
5. Assign new package with notes
6. Verify audit record created
7. Verify user's cache updated immediately
8. Test user can now access new features

### Scenario 5: Edit Window Testing
1. Create analysis as Analyzer Pro
2. Immediately edit (within 30 seconds) → Should succeed
3. Wait 4 minutes, edit again → Should succeed
4. Wait 6 minutes total, try to edit → Should fail with "EDIT_WINDOW_EXPIRED"
5. Verify audit record shows both successful edits
6. Verify "Edited" badge appears on analysis

---

## Test Data Setup

### Create Test Users
```sql
-- Free Trader (default, nothing needed)

-- Pro Trader
INSERT INTO user_entitlements (user_id, package_key, status)
VALUES ('<user_id>', 'pro_trader', 'active');

-- Analyzer Pro (requires analyzer role)
INSERT INTO user_entitlements (user_id, package_key, status)
VALUES ('<analyzer_user_id>', 'analyzer_pro', 'active');

-- Analyzer Elite (requires analyzer role)
INSERT INTO user_entitlements (user_id, package_key, status)
VALUES ('<elite_analyzer_id>', 'analyzer_elite', 'active');
```

### Verify Cache Populated
```sql
SELECT * FROM user_limits_cache WHERE user_id = '<user_id>';
```

### Check Audit Trail
```sql
-- Entitlement changes
SELECT * FROM user_entitlement_audit
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;

-- Role changes
SELECT * FROM user_role_audit
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;

-- Analysis edits
SELECT * FROM analysis_edits_audit
WHERE analysis_id = '<analysis_id>'
ORDER BY edited_at DESC;
```

---

## Success Criteria

The packages system is considered fully functional when:

✅ **All database tables and policies are in place**
✅ **Entitlements service correctly enforces all limits**
✅ **All API endpoints validate entitlements server-side**
✅ **Follow limit enforced at 50 for Free Trader**
✅ **Publishing limits work correctly (Pro=20/day, Elite=unlimited)**
✅ **5-minute edit window enforced with audit trail**
✅ **Extended targets work for Analyzer Pro/Elite only**
✅ **Live updates gated to appropriate packages**
✅ **Symbol watchlist gated to Pro Trader+**
✅ **Telegram channel limits enforced (Pro=2, Elite=4)**
✅ **Pricing page displays correctly**
✅ **Admin can assign/manage packages**
✅ **Complete audit trail for all changes**
✅ **No regressions in existing features**
✅ **Build completes without errors**

---

## Notes for Future Development

### Phase 2 Enhancements (Not Yet Implemented)
- [ ] Admin UI for package management
- [ ] Package badges throughout UI
- [ ] Feature lock indicators with upgrade CTAs
- [ ] Export functionality (PDF/CSV)
- [ ] Payment integration for Pro/Elite packages
- [ ] Automated email notifications on package changes
- [ ] Analytics dashboard for admin (package distribution, conversions)
- [ ] Self-service upgrade flows
- [ ] Trial periods for Pro/Elite packages
- [ ] Referral system with package rewards

### Known Limitations
- Packages currently manual assignment only (no payment flow)
- UI feature locks not yet implemented across all features
- Admin panel package management UI not built yet
- Multi-channel Telegram settings UI needs work
- Elite badge not yet displayed in UI

---

## Contact & Support

For issues or questions about the packages system:
- Check this testing checklist first
- Review `/services/entitlements/entitlements.service.ts` for business logic
- Check database RLS policies in migration files
- Contact development team for admin panel access

Last Updated: 2025-12-28
