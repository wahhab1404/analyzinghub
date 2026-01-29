# Telegram Channel Subscription - Quick Start Guide

## For Traders (Subscribers)

### How to Subscribe and Get Channel Access

1. **Find an Analyzer's Plan**
   - Browse to an analyzer's profile
   - View their subscription plans
   - Choose a plan to subscribe

2. **Provide Telegram Username**
   - Click "Subscribe Now"
   - If prompted, enter your Telegram username
   - Username format: No @ symbol (e.g., "john_doe" not "@john_doe")
   - Your username is saved for future subscriptions

3. **Receive Channel Invite**
   - Check your Telegram app
   - Bot will send you a direct message
   - Message contains private channel invite link
   - Link expires in 24 hours (use it promptly!)

4. **Join the Channel**
   - Click the invite link in Telegram
   - You'll be added to the private channel
   - Start receiving exclusive content

### Important Notes

- **Start the Bot First**: Open a chat with the bot in Telegram so it can message you
- **Privacy Settings**: Ensure your Telegram privacy allows messages from the bot
- **Username Accuracy**: Double-check your username before submitting
- **Link Expiration**: Invite links expire after 24 hours - join quickly!
- **One Channel Per Plan**: Each subscription gives access to one specific channel

### What Happens When Subscription Expires?

1. You'll receive a notification from the bot
2. You'll be automatically removed from the channel
3. You'll lose access to channel content
4. To regain access, renew your subscription

---

## For Analyzers (Content Creators)

### Setting Up Telegram Channel Subscription

#### Prerequisites

1. **Create Telegram Channel**
   - Create a private channel in Telegram
   - Make it private (not public)
   - Note the channel name/ID

2. **Add Bot as Admin**
   - Add the AnalyZHub bot to your channel
   - Make it an admin with these permissions:
     - Add new members
     - Ban/kick members
     - Create invite links

#### Step-by-Step Setup

1. **Create Subscription Plan**
   ```
   Dashboard → Settings → Plans → Create New Plan
   ```
   - Set plan name (e.g., "Premium Signals")
   - Set pricing (monthly/yearly)
   - Add features and description

2. **Link Telegram Channel**
   - In plan settings, select "Connect Telegram Channel"
   - Choose your channel from the list
   - Verify bot has admin access

3. **Activate Plan**
   - Toggle plan to "Active"
   - Plan appears in your profile
   - Ready for subscriptions!

### How It Works Automatically

**When Someone Subscribes:**
1. System captures their Telegram username
2. Generates unique invite link
3. Bot sends DM with invite link
4. Subscriber joins your channel
5. You get notified of new subscriber

**When Subscription Expires:**
1. System detects expiration
2. Bot removes user from channel
3. User receives expiration notice
4. You don't need to do anything!

### Managing Subscribers

**View Active Subscribers:**
```
Dashboard → Subscribers → [Select Plan]
```

**Check Channel Members:**
- Use Telegram's built-in member list
- Or view in AnalyZHub dashboard
- See join dates and status

**Handle Renewals:**
- System automatically sends new invite
- Previous access is restored
- No manual intervention needed

### Best Practices

1. **Channel Content**
   - Post valuable exclusive content regularly
   - Engage with members
   - Announce new features/analyses

2. **Communication**
   - Set clear expectations about content
   - Explain Telegram requirement in plan description
   - Respond to subscriber questions

3. **Testing**
   - Test subscription flow yourself first
   - Create a free test plan initially
   - Verify bot sends invites correctly

4. **Monitoring**
   - Check subscriber count regularly
   - Monitor channel engagement
   - Track subscription renewals

---

## Quick Troubleshooting

### For Traders

**"I didn't receive the invite link"**
- Check you entered correct username
- Ensure you started bot (open chat first)
- Check Telegram privacy settings
- Look in "Archived Chats" or "Spam"
- Contact analyzer for manual invite

**"Invite link expired"**
- Contact the analyzer
- They can generate a new invite
- Or resubscribe to get new link

**"I was removed from the channel"**
- Check your subscription status
- Subscription may have expired
- Renew to regain access

### For Analyzers

**"Bot can't send invites"**
- Verify bot is channel admin
- Check bot has "Add Members" permission
- Test with your own account first

**"Users not removed when expired"**
- Check cron job is running
- Verify bot has "Ban Members" permission
- Contact support if issue persists

**"Wrong users invited"**
- Users must enter correct username
- No @ symbol should be included
- Users can update username in settings

---

## Testing Checklist

### Before Going Live

- [ ] Bot added as channel admin
- [ ] Bot has all required permissions
- [ ] Test subscription with free plan
- [ ] Verify invite link received
- [ ] Join channel successfully
- [ ] Test expiration flow
- [ ] Verify removal works

### After Launch

- [ ] Monitor first few subscriptions
- [ ] Check invite delivery rate
- [ ] Respond to subscriber questions
- [ ] Track channel engagement
- [ ] Review subscription analytics

---

## Support

### For Traders
- Check analyzer's profile for contact info
- Review plan description for requirements
- Contact platform support for technical issues

### For Analyzers
- Review full documentation: `TELEGRAM_CHANNEL_SUBSCRIPTION_SYSTEM.md`
- Check bot permissions in channel
- Monitor subscription analytics
- Contact platform support for advanced issues

---

## Key Takeaways

**Traders:**
- Enter correct Telegram username
- Start bot before subscribing
- Join channel within 24 hours
- Renew before expiration to keep access

**Analyzers:**
- Add bot as channel admin first
- Link channel to subscription plan
- Everything else is automated
- Focus on creating great content

---

**Ready to start? Traders: Find an analyzer to subscribe to. Analyzers: Set up your first plan!**
