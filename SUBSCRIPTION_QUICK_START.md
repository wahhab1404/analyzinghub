# Subscription System - Quick Start Guide

## For Analyzers: Creating Subscription Plans

### Step 1: Navigate to Settings
1. Log in as an Analyzer
2. Go to Dashboard → Settings
3. Find "Subscription Plans" section

### Step 2: Create Your First Plan

**Basic Plan Example:**
```
Name: Starter Plan
Description: Get access to my weekly market analyses
Price: $0 (Free for testing)
Billing: Monthly
Features:
- Weekly market analysis
- Basic support
- Email alerts
Max Subscribers: 50
```

**Premium Plan Example:**
```
Name: Pro Plan
Description: Exclusive analyses + Telegram channel access
Price: $0 (Free for testing)
Billing: Monthly
Features:
- Daily market analysis
- Real-time alerts
- Telegram channel access
- Priority support
- Advanced technical analysis
Max Subscribers: 20
Telegram Channel: -1001234567890 (optional)
```

### Step 3: Manage Your Plans
- **Activate/Deactivate**: Toggle plan availability
- **Update**: Edit description, features, or limits
- **Delete**: Remove plans with no active subscribers
- **Monitor**: Track subscriber counts

### Step 4: Create Subscriber-Only Content

When creating a new analysis:
1. Fill in analysis details (symbol, direction, targets)
2. Select **"Subscribers Only"** from visibility dropdown
3. Publish

Only your active subscribers can now view this analysis!

## For Traders: Subscribing to Analyzers

### Step 1: Find Analyzer
1. Browse analyzer profiles
2. View their public analyses
3. Check their track record

### Step 2: View Plans
Scroll to "Subscription Plans" section on analyzer profile

### Step 3: Subscribe
1. Click **"Subscribe Now"** on desired plan
2. Subscription activates immediately
3. Access period starts (30 or 365 days)

### Step 4: Access Premium Content
- View subscriber-only analyses
- Get Telegram channel invite link (if applicable)
- Receive exclusive alerts

### Step 5: Manage Subscription
Go to Dashboard → Settings → My Subscriptions

**Options:**
- **Cancel at Period End**: Keep access until billing date, then cancel
- **Cancel Immediately**: Lose access right away, no refund

## Using the System

### Creating Different Content Types

#### 1. Public Analysis
```
Symbol: AAPL
Direction: Long
Visibility: Public ✅
```
→ Everyone can see

#### 2. Followers-Only Analysis
```
Symbol: MSFT
Direction: Short
Visibility: Followers Only 👥
```
→ Only your followers can see

#### 3. Subscribers-Only Analysis
```
Symbol: TSLA
Direction: Long
Visibility: Subscribers Only 💎
```
→ Only paid subscribers can see

#### 4. Private Analysis
```
Symbol: GOOGL
Direction: Neutral
Visibility: Private 🔒
```
→ Only you can see

### Telegram Channel Integration

#### For Analyzers:

**Step 1: Create Telegram Channel**
1. Open Telegram
2. Create new channel
3. Make it private
4. Get channel ID (use @userinfobot)

**Step 2: Add Bot as Admin**
1. Add your AnalyzingHub bot to channel
2. Promote to admin
3. Enable "Invite Users" permission

**Step 3: Verify Channel**
```bash
Settings → Telegram → Verify Channel
Enter Channel ID: -1001234567890
Click "Verify"
```

**Step 4: Link to Plan**
When creating plan, enter verified channel ID

#### For Subscribers:

**Step 1: Subscribe to Plan** with Telegram

**Step 2: Get Invite Link**
Go to My Subscriptions → Click "Join Telegram Channel"

**Step 3: Join Channel**
Click invite link → Join channel in Telegram app

## API Usage Examples

### Check if User Has Active Subscription
```javascript
const response = await fetch(
  `/api/subscriptions/check?analystId=${analystId}`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
)

const { hasActiveSubscription } = await response.json()

if (hasActiveSubscription) {
  // Show premium content
} else {
  // Show upgrade prompt
}
```

### Subscribe to Plan
```javascript
const response = await fetch('/api/subscriptions/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ planId })
})

const { subscriptionId, inviteLink } = await response.json()

if (inviteLink) {
  // Show Telegram invite link
}
```

### Cancel Subscription
```javascript
// Option 1: Cancel at period end
await fetch('/api/subscriptions/cancel', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    subscriptionId,
    mode: 'end_of_period'
  })
})

// Option 2: Cancel immediately
await fetch('/api/subscriptions/cancel', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    subscriptionId,
    mode: 'immediate'
  })
})
```

## Common Questions

### Q: Can I create multiple plans?
**A:** Yes! Create as many plans as you want (Lite, Pro, VIP, etc.)

### Q: What happens when subscription expires?
**A:** Access to subscriber-only content is automatically revoked

### Q: Can I change plan prices later?
**A:** Yes, update plan details anytime. Existing subscriptions keep original price.

### Q: What if I reach max subscribers?
**A:** New users cannot subscribe until spots open up. Consider increasing limit or creating new plan.

### Q: How do I delete a plan?
**A:** Plans with active subscribers cannot be deleted. Cancel all subscriptions first or wait for expiry.

### Q: Can users subscribe to multiple plans?
**A:** Yes! Users can subscribe to multiple analysts' plans.

### Q: What about refunds?
**A:** Currently manual subscriptions are free. When payment integration is added, implement refund policy.

### Q: How secure is the system?
**A:** Very secure:
- Database-level access control (RLS)
- All writes via service role only
- Server-side validation
- No client-side bypass possible

### Q: Can I see who my subscribers are?
**A:** Not directly in UI yet, but you can query:
```sql
SELECT p.email, p.full_name, s.created_at
FROM subscriptions s
JOIN profiles p ON s.subscriber_id = p.id
WHERE s.analyst_id = 'your-id'
AND s.status = 'active';
```

## Tips for Success

### For Analyzers
1. **Start with free plans** to build audience
2. **Create variety of content** (public, followers, subscribers)
3. **Set realistic subscriber limits** (quality over quantity)
4. **Use Telegram integration** for better engagement
5. **Monitor subscriber feedback** and adjust

### For Traders
1. **Try public content first** before subscribing
2. **Check analyzer track record** via success metrics
3. **Start with lower tier** then upgrade if needed
4. **Use cancellation wisely** (end of period vs immediate)
5. **Join Telegram channels** for real-time updates

## Troubleshooting

### "Already subscribed to this plan"
You have an active subscription. Cancel first if you want to re-subscribe.

### "Plan has reached maximum subscribers"
Plan is full. Try different plan or wait for opening.

### "Only analyzers can create plans"
Your account role is not Analyzer. Contact admin.

### "Cannot delete plan with active subscribers"
Wait for subscriptions to expire or cancel them first.

### "Telegram invite link expired"
Links expire after 24 hours. Request new link from My Subscriptions.

### "Bot is not admin in channel"
Add bot to channel and promote to admin with invite permission.

## Support

### For Development Issues
- Check SUBSCRIPTION_SYSTEM.md for architecture details
- Review TEST_SUBSCRIPTION_FLOW.md for API examples
- Check Supabase logs for RLS policy errors

### For User Issues
- Verify authentication token is valid
- Check subscription status in database
- Review RLS policies for access issues
- Test API endpoints with curl commands

---

**Ready to start?** Create your first plan or subscribe to your favorite analyzer! 🚀
