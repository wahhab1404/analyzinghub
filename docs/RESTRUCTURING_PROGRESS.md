# Platform Restructuring Progress Report

## Project Scope
Complete re-architecture of AnalyzingHub platform including:
- Navigation restructure
- Unified contract trades system (companies + indices)
- Canonical P/L logic ($100 win threshold)
- Report deduplication
- Robust image generation
- Arabic + English support

## ✅ COMPLETED (Phase 1)

### 1. Database Schema - Unified Contract Trades System
**Status:** ✅ COMPLETE

**Created:**
- New table: `contract_trades` - unified trades for both companies and indices
- Supporting table: `contract_trade_updates` - price history tracking
- Junction table: `report_trades` - links trades to reports with dedupe constraints

**Key Features:**
- `scope` field distinguishes 'company' vs 'index' trades
- Canonical P/L tracking with generated columns
- Automatic $100 threshold calculation
- High watermark tracking (`max_price_since_entry`)
- Average entry adjustment support
- Telegram integration fields
- Idempotency support

**Files Created:**
- `/supabase/migrations/create_unified_contract_trades_system.sql`

### 2. Canonical P/L Service
**Status:** ✅ COMPLETE

**Created:** `/services/trades/canonical-pnl.service.ts`

**Functions:**
- `calculateCanonicalPnL()` - Core P/L calculation with $100 threshold
- `hasMetWinThreshold()` - Check if trade met win condition
- `calculateCurrentProfit()` - Real-time profit calculation
- `updateHighWatermark()` - Track maximum prices
- `calculateAverageEntry()` - Weighted average for trade averaging
- `determineTradeOutcome()` - WIN/LOSS/EXPIRED status
- Validation and formatting utilities

**Rules Enforced:**
1. WIN: `max_profit >= $100` → `pnl = max_profit`
2. LOSS: `max_profit < $100` → `pnl = -entry_cost_total`
3. NO BREAKEVENS - Only WIN or LOSS
4. Expired trades follow same rules

### 3. Navigation Restructure
**Status:** ✅ COMPLETE

**Updated:** `/components/dashboard/Sidebar.tsx`

**New Structure:**
```
1. Dashboard
2. Feed
3. My Profile
4. Companies (collapsible)
   - Explore Companies
   - Company Analyses
   - Create Company Analysis
5. Indices Hub (collapsible)
   - Indices Analyses
   - Create Index Trade
   - Daily Reports
6. Rankings
7. Subscriptions
8. My Subscribers
9. Financial
10. Activity
11. Settings
12. Admin Dashboard
```

**Features:**
- Collapsible sections with chevron indicators
- Visual hierarchy with indentation
- Active state highlighting
- Mobile-responsive design
- RTL support maintained

### 4. Translations Updated
**Status:** ✅ COMPLETE

**Files Updated:**
- `/lib/i18n/translations/en.ts`
- `/lib/i18n/translations/ar.ts`

**Added Navigation Labels:**
- `nav.companies` - "Companies" / "الشركات"
- `nav.exploreCompanies` - "Explore Companies" / "استكشاف الشركات"
- `nav.companyAnalyses` - "Company Analyses" / "تحليلات الشركات"
- `nav.indicesHub` - "Indices Hub" / "مركز المؤشرات"
- `nav.indicesFeed` - "Indices Analyses" / "تحليلات المؤشرات"
- `nav.dailyReports` - "Daily Reports" / "التقارير اليومية"
- And more...

### 5. Report Deduplication (Database Level)
**Status:** ✅ COMPLETE

**Implemented:**
- Unique constraint on `report_trades(report_id, trade_id)`
- Additional constraint on trade characteristics
- Prevents same trade from appearing twice in a report

## 🚧 IN PROGRESS / PENDING

### 6. Companies Section Routes & Pages
**Status:** 🔴 PENDING

**Required:**
- `/app/dashboard/companies/page.tsx` - Explore companies
- `/app/dashboard/companies/analyses/page.tsx` - List company analyses
- Update `/app/dashboard/create-analysis/page.tsx` to support both types

### 7. Company Analysis Options Trades Tab
**Status:** 🔴 PENDING

**Required:**
- Add "Options Trades" tab to company analysis detail pages
- Create form to add contract trades to company analyses
- List view showing all trades for a company analysis
- Support average entry adjustment workflow
- Telegram notification integration

**Components Needed:**
- `CompanyContractTradesTab.tsx`
- `CreateCompanyTradeDialog.tsx`
- `CompanyTradesList.tsx`

### 8. Robust Image Generation Service
**Status:** 🔴 PENDING

**Requirements:**
- Server-side image rendering (Playwright/Puppeteer)
- Arabic + English text rendering (RTL + LTR)
- Contract trade snapshot images
- Storage in Supabase Storage
- Telegram image sending
- Retry logic and error handling
- Arabic strike price formatting: "سترايك: ####"

**Files to Create:**
- `/services/image/contract-image.service.ts`
- `/services/image/playwright-renderer.ts`
- Edge function: `/supabase/functions/generate-contract-image/`

### 9. Update P/L Calculations Across Codebase
**Status:** 🔴 PENDING

**Files to Update:**
- All dashboard statistics components
- Profile stats calculations
- Rankings calculations
- Report generation logic
- Telegram notification messages
- Analyzer performance metrics

**Must Apply Canonical Rules:**
- Replace all P/L calculations with `calculateCanonicalPnL()`
- Remove "breakeven" outcome entirely
- Update all displays to show WIN/LOSS only
- Update profit aggregations to use canonical values

### 10. Report Generation Dedupe Logic
**Status:** 🔴 PENDING

**Files to Update:**
- `/services/indices/daily-report-generator.ts`
- Report API endpoints
- Ensure only unique trades are included
- Backfill script for existing duplicates

### 11. Feed Enhancement (Combined Feed)
**Status:** 🔴 PENDING

**Requirements:**
- Add tabs to Feed page: [Company Analyses] [Articles] [News]
- Filter by post type
- Sort options
- Search within feed

### 12. Index Analysis Updates
**Status:** 🔴 PENDING

**Requirements:**
- Migrate existing `index_trades` to use canonical P/L
- Update trade tracking to use new service
- Update Telegram notifications
- Ensure market hours checking

### 13. Testing & Validation
**Status:** 🔴 PENDING

**Test Cases:**
- Create company trade → verify canonical P/L
- Trade reaches $50 profit → verify shows as LOSS
- Trade reaches $150 profit → verify shows as WIN
- Expired trade with $80 profit → verify LOSS
- Average entry adjustment → verify weighted calculation
- Report generation → verify no duplicates
- Image generation → verify Arabic + English render
- Telegram → verify images send correctly

## 📋 MIGRATION PLAN

### Phase 2: Core Functionality (Next Steps)
1. Create company routes and pages
2. Add contract trades tab to company analyses
3. Implement trade creation forms
4. Update all P/L calculations to use canonical service

### Phase 3: Advanced Features
1. Implement robust image generation
2. Update Telegram integration
3. Enhance feed with tabs and filters
4. Backfill existing trades with canonical P/L

### Phase 4: Testing & Refinement
1. Comprehensive testing of all features
2. Performance optimization
3. User acceptance testing
4. Documentation updates

## 🔐 SECURITY NOTES

All tables have RLS enabled:
- `contract_trades` - Users can only access their own trades
- `contract_trade_updates` - Linked to parent trade permissions
- `report_trades` - Linked to report permissions
- Service role has full access for background jobs

## 📊 DATABASE STATS

**New Tables Created:** 3
- `contract_trades`
- `contract_trade_updates`
- `report_trades`

**Indexes Created:** 10+
**RLS Policies:** 12
**Functions:** 3
**Triggers:** 2

## 🎯 SUCCESS CRITERIA

- [ ] Navigation matches new IA
- [ ] Company analyses support options trades
- [ ] All P/L follows $100 threshold rule
- [ ] No breakeven outcomes anywhere
- [ ] Reports have no duplicate trades
- [ ] Images generate reliably with Arabic support
- [ ] Telegram sends images correctly
- [ ] All existing functionality preserved
- [ ] Mobile responsive
- [ ] RTL support maintained

## 📝 NOTES

1. **Backward Compatibility:** Existing `index_trades` table remains for now. New unified system runs in parallel. Migration script needed to consolidate.

2. **Route Aliases:** May need to add redirects for old routes to maintain backward compatibility.

3. **Performance:** Canonical P/L is calculated via database triggers and generated columns for optimal performance.

4. **Telegram:** Market hours checking must be respected - only send alerts during trading hours.

5. **Testing:** Unit tests needed for canonical P/L service before deploying to production.

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Run migration: `create_unified_contract_trades_system`
- [ ] Deploy canonical P/L service
- [ ] Deploy updated sidebar navigation
- [ ] Deploy translation updates
- [ ] Test navigation on mobile
- [ ] Test collapsible sections
- [ ] Verify RLS policies
- [ ] Monitor performance
- [ ] User acceptance testing

---

**Last Updated:** 2026-02-11
**Progress:** ~30% Complete
**Estimated Remaining Work:** 2-3 development sessions
