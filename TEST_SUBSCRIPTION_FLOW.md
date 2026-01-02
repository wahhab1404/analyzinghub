# Subscription System Test Script

## Prerequisites
- Database migrations applied
- Application running locally or deployed
- Access to Supabase dashboard
- Telegram bot configured (optional, for Telegram tests)

## Test Accounts Setup

### 1. Create Test Analyzer
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyzer-test@example.com",
    "fullName": "Test Analyzer",
    "password": "TestPass123!"
  }'

# Then update role in Supabase dashboard:
# UPDATE profiles SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
# WHERE email = 'analyzer-test@example.com';
```

### 2. Create Test Traders
```bash
# Trader 1 (will subscribe)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader1-test@example.com",
    "fullName": "Test Trader 1",
    "password": "TestPass123!"
  }'

# Trader 2 (will not subscribe)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader2-test@example.com",
    "fullName": "Test Trader 2",
    "password": "TestPass123!"
  }'
```

## Test Cases

### TC1: Create Subscription Plan (Analyzer)

**Login as Analyzer**
```bash
# Get auth token
ANALYZER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyzer-test@example.com",
    "password": "TestPass123!"
  }' | jq -r '.token')
```

**Create Plan**
```bash
curl -X POST http://localhost:3000/api/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "name": "Pro Plan",
    "description": "Access to exclusive analyses and insights",
    "price_cents": 0,
    "billing_interval": "month",
    "features": {
      "feature_1": "Daily market analyses",
      "feature_2": "Real-time alerts",
      "feature_3": "Priority support"
    },
    "max_subscribers": 10
  }'
```

**Expected Result:** ✅ Plan created successfully
**Verify:** Check Supabase `analyzer_plans` table

---

### TC2: View Available Plans (Trader)

**Login as Trader 1**
```bash
TRADER1_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader1-test@example.com",
    "password": "TestPass123!"
  }' | jq -r '.token')
```

**Get Analyzer Plans**
```bash
# First, get analyzer ID from profile
ANALYZER_ID=$(curl http://localhost:3000/api/profile \
  -H "Authorization: Bearer $ANALYZER_TOKEN" | jq -r '.profile.id')

# Fetch plans
curl http://localhost:3000/api/plans?analystId=$ANALYZER_ID | jq
```

**Expected Result:** ✅ Returns Pro Plan with subscriberCount: 0
**Store Plan ID for next tests**
```bash
PLAN_ID=$(curl http://localhost:3000/api/plans?analystId=$ANALYZER_ID | jq -r '.plans[0].id')
```

---

### TC3: Subscribe to Plan

```bash
curl -X POST http://localhost:3000/api/subscriptions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"planId\": \"$PLAN_ID\"
  }" | jq
```

**Expected Result:** ✅
- Returns subscriptionId, status: 'active', periodEnd (30 days from now)
- If Telegram configured, returns inviteLink

**Verify:**
```sql
SELECT * FROM subscriptions WHERE plan_id = '<PLAN_ID>';
SELECT * FROM telegram_memberships WHERE subscription_id = '<SUBSCRIPTION_ID>';
```

---

### TC4: Prevent Duplicate Subscription

```bash
curl -X POST http://localhost:3000/api/subscriptions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"planId\": \"$PLAN_ID\"
  }" | jq
```

**Expected Result:** ❌ Error: "Already subscribed to this plan"

---

### TC5: View My Subscriptions

```bash
curl http://localhost:3000/api/subscriptions/me \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq
```

**Expected Result:** ✅ Returns active subscription with:
- Plan details
- Analyst info
- Period end date
- Telegram invite link (if applicable)

---

### TC6: Create Subscriber-Only Analysis (Analyzer)

```bash
curl -X POST http://localhost:3000/api/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "symbol": "AAPL",
    "direction": "Long",
    "stopLoss": "150.00",
    "targets": [
      {"price": "180.00", "expectedTime": "01/03/2025"},
      {"price": "200.00", "expectedTime": "01/06/2025"}
    ],
    "analysisType": "classic",
    "chartFrame": "4H",
    "description": "Bullish setup on AAPL with strong support",
    "visibility": "subscribers"
  }' | jq
```

**Store Analysis ID**
```bash
ANALYSIS_ID=$(curl http://localhost:3000/api/analyses \
  -H "Authorization: Bearer $ANALYZER_TOKEN" | jq -r '.analyses[0].id')
```

**Expected Result:** ✅ Analysis created with visibility: 'subscribers'

---

### TC7: Verify Subscriber Can Access Analysis

```bash
curl http://localhost:3000/api/analyses/$ANALYSIS_ID \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq
```

**Expected Result:** ✅ Returns full analysis details

---

### TC8: Verify Non-Subscriber Cannot Access Analysis

**Login as Trader 2**
```bash
TRADER2_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "trader2-test@example.com",
    "password": "TestPass123!"
  }' | jq -r '.token')
```

**Try to Access Subscriber-Only Analysis**
```bash
curl http://localhost:3000/api/analyses/$ANALYSIS_ID \
  -H "Authorization: Bearer $TRADER2_TOKEN" | jq
```

**Expected Result:** ❌ Returns 403 or empty result (blocked by RLS)

---

### TC9: Check Subscription Status

```bash
curl "http://localhost:3000/api/subscriptions/check?analystId=$ANALYZER_ID" \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq
```

**Expected Result:** ✅ Returns hasActiveSubscription: true

```bash
curl "http://localhost:3000/api/subscriptions/check?analystId=$ANALYZER_ID" \
  -H "Authorization: Bearer $TRADER2_TOKEN" | jq
```

**Expected Result:** ✅ Returns hasActiveSubscription: false

---

### TC10: Cancel Subscription (End of Period)

```bash
SUBSCRIPTION_ID=$(curl http://localhost:3000/api/subscriptions/me \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq -r '.subscriptions[0].id')

curl -X POST http://localhost:3000/api/subscriptions/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"subscriptionId\": \"$SUBSCRIPTION_ID\",
    \"mode\": \"end_of_period\"
  }" | jq
```

**Expected Result:** ✅
- Returns cancelAtPeriodEnd: true
- Message: "Subscription will be canceled at the end of the billing period"

**Verify Continued Access**
```bash
curl http://localhost:3000/api/analyses/$ANALYSIS_ID \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq
```

**Expected Result:** ✅ Still has access (period hasn't ended)

---

### TC11: Reactivate Subscription (Cancel the Cancellation)

This would require a new endpoint, but for now test that user still has access

---

### TC12: Cancel Subscription (Immediate)

**Create new subscription first**
```bash
# You may need to update the database to allow re-subscription
# or create a new test user

curl -X POST http://localhost:3000/api/subscriptions/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"subscriptionId\": \"$SUBSCRIPTION_ID\",
    \"mode\": \"immediate\"
  }" | jq
```

**Expected Result:** ✅
- Returns status: 'canceled'
- Message: "Subscription canceled immediately"

**Verify Access Revoked**
```bash
curl http://localhost:3000/api/analyses/$ANALYSIS_ID \
  -H "Authorization: Bearer $TRADER1_TOKEN" | jq
```

**Expected Result:** ❌ No access to subscriber-only content

---

### TC13: Verify Subscriber Limit

**Create 10 subscriptions** (max_subscribers = 10)
- Create 10 trader accounts
- Subscribe each one to the Pro Plan

**Try to create 11th subscription**
```bash
curl -X POST http://localhost:3000/api/subscriptions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEW_TRADER_TOKEN" \
  -d "{
    \"planId\": \"$PLAN_ID\"
  }" | jq
```

**Expected Result:** ❌ Error: "Plan has reached maximum subscribers"

---

### TC14: Test Different Visibility Levels

**Create Public Analysis**
```bash
curl -X POST http://localhost:3000/api/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "symbol": "MSFT",
    "direction": "Long",
    "stopLoss": "300.00",
    "targets": [{"price": "350.00", "expectedTime": "01/04/2025"}],
    "visibility": "public"
  }' | jq
```

**Verify all users can access**
- Test with TRADER1_TOKEN ✅
- Test with TRADER2_TOKEN ✅
- Test without auth token ✅ (or ❌ depending on RLS)

**Create Followers-Only Analysis**
```bash
curl -X POST http://localhost:3000/api/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "symbol": "GOOGL",
    "direction": "Long",
    "stopLoss": "100.00",
    "targets": [{"price": "120.00", "expectedTime": "01/04/2025"}],
    "visibility": "followers"
  }' | jq
```

**Follow analyzer first**
```bash
curl -X POST http://localhost:3000/api/follow \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"profileId\": \"$ANALYZER_ID\"
  }"
```

**Verify only followers can access**
- Test with TRADER1_TOKEN (follower) ✅
- Test with TRADER2_TOKEN (non-follower) ❌

**Create Private Analysis**
```bash
curl -X POST http://localhost:3000/api/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "symbol": "TSLA",
    "direction": "Short",
    "stopLoss": "500.00",
    "targets": [{"price": "400.00", "expectedTime": "01/04/2025"}],
    "visibility": "private"
  }' | jq
```

**Verify only owner can access**
- Test with ANALYZER_TOKEN ✅
- Test with TRADER1_TOKEN ❌
- Test with TRADER2_TOKEN ❌

---

### TC15: Test Plan Management

**Update Plan**
```bash
curl -X PUT http://localhost:3000/api/plans/$PLAN_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "description": "Updated description with more features",
    "max_subscribers": 20
  }' | jq
```

**Expected Result:** ✅ Plan updated successfully

**Deactivate Plan**
```bash
curl -X PUT http://localhost:3000/api/plans/$PLAN_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "is_active": false
  }' | jq
```

**Verify hidden from public**
```bash
curl http://localhost:3000/api/plans?analystId=$ANALYZER_ID | jq
```

**Expected Result:** ✅ Returns empty plans array

---

### TC16: Telegram Integration (Optional)

**Prerequisites:**
- Telegram bot configured
- Telegram channel created
- Bot added as admin to channel

**Verify Channel**
```bash
curl -X POST http://localhost:3000/api/telegram/verify-channel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "channelId": "-1001234567890"
  }' | jq
```

**Expected Result:** ✅ Returns isAdmin: true, canInviteUsers: true

**Create Plan with Telegram**
```bash
curl -X POST http://localhost:3000/api/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANALYZER_TOKEN" \
  -d '{
    "name": "Premium Plan",
    "telegram_channel_id": "-1001234567890",
    ...other fields
  }' | jq
```

**Subscribe and get invite link**
```bash
curl -X POST http://localhost:3000/api/subscriptions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADER1_TOKEN" \
  -d "{
    \"planId\": \"$NEW_PLAN_ID\"
  }" | jq
```

**Expected Result:** ✅ Returns inviteLink
**Manual Test:** Click invite link and join Telegram channel

---

## Automated Test Summary

Create a test script that runs all tests:

```bash
#!/bin/bash

echo "🧪 Running Subscription System Tests..."

# Source environment variables
source .env.test

# Run tests
./test-tc1-create-plan.sh
./test-tc2-view-plans.sh
./test-tc3-subscribe.sh
./test-tc4-duplicate-sub.sh
# ... etc

echo "✅ All tests completed"
```

## Database Verification Queries

```sql
-- Check all subscriptions
SELECT
  s.*,
  p.email as subscriber_email,
  a.email as analyst_email,
  ap.name as plan_name
FROM subscriptions s
JOIN profiles p ON s.subscriber_id = p.id
JOIN profiles a ON s.analyst_id = a.id
JOIN analyzer_plans ap ON s.plan_id = ap.id;

-- Check subscriber counts
SELECT
  ap.name,
  ap.max_subscribers,
  COUNT(s.id) as active_subscribers
FROM analyzer_plans ap
LEFT JOIN subscriptions s ON ap.id = s.plan_id AND s.status = 'active'
GROUP BY ap.id, ap.name, ap.max_subscribers;

-- Check visibility enforcement
SELECT
  a.id,
  s.symbol,
  a.visibility,
  p.full_name as analyzer,
  COUNT(sub.id) as subscribers
FROM analyses a
JOIN symbols s ON a.symbol_id = s.id
JOIN profiles p ON a.analyzer_id = p.id
LEFT JOIN subscriptions sub ON sub.analyst_id = a.analyzer_id AND sub.status = 'active'
WHERE a.visibility = 'subscribers'
GROUP BY a.id, s.symbol, a.visibility, p.full_name;
```

## Success Criteria

- ✅ All 16 test cases pass
- ✅ No RLS policy violations in logs
- ✅ No TypeScript compilation errors
- ✅ No console errors in browser
- ✅ Proper error messages for user
- ✅ UI components render correctly
- ✅ Loading states work properly
- ✅ Notifications sent correctly
