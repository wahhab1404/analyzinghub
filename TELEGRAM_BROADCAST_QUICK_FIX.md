# Quick Fix: Telegram Broadcasts Not Sending

## What Was Wrong
The code was checking for a column called `verified` (boolean) that doesn't exist. The table actually has `verified_at` (timestamp).

## What Was Fixed
Changed from:
```typescript
.eq('verified', true)  // ❌ Wrong
```

To:
```typescript
.not('verified_at', 'is', null)  // ✅ Correct
```

## How to Verify It's Working

### 1. Check Your Channels
Run this command:
```bash
npm run check:telegram-channels
```

This will show you:
- All configured channels
- Which ones are verified
- Which ones are enabled
- Which notifications are turned on
- Any configuration issues

### 2. What to Look For
Your channels should have:
- ✅ `verified_at` with a date (not NULL)
- ✅ `enabled = true`
- ✅ `notify_new_analysis = true`
- ✅ `is_platform_default = true` (for at least one channel per audience type)

### 3. Test a Broadcast
1. Create a new analysis
2. Check the browser console logs for:
   ```
   TELEGRAM_BROADCAST_PREPARATION
   PLAN_SPECIFIC_CHANNELS_QUERY
   PLATFORM_DEFAULT_CHANNEL_QUERY
   FINAL_BROADCAST_CHANNELS
   TELEGRAM_BROADCAST_START
   TELEGRAM_BROADCAST_RESULT
   ```

3. Check your Telegram channel - the message should appear

## Common Issues

### "No channels to broadcast to"
**Problem:** No channel found for the analysis visibility

**Fix:**
1. Go to Settings → Telegram
2. Make sure you have a channel configured for the visibility type (public/followers/subscribers)
3. Make sure `is_platform_default = true` for that channel
4. Verify the channel is enabled and verified

### "Channel not verified"
**Problem:** `verified_at` is NULL

**Fix:**
1. Go to Settings → Telegram
2. Click "Verify Channel" button
3. Follow the bot instructions

### "Notifications disabled"
**Problem:** `notify_new_analysis = false`

**Fix:**
1. Go to Settings → Telegram
2. Toggle on "Notify New Analysis"
3. Save settings

## Files Changed
- `app/api/analyses/route.ts` - Fixed channel queries and added logging
- `scripts/check-telegram-channels.ts` - New diagnostic script
- `package.json` - Added `check:telegram-channels` command

## Quick SQL Check
```sql
-- See all your channels
SELECT
  channel_name,
  audience_type,
  enabled,
  notify_new_analysis,
  is_platform_default,
  verified_at IS NOT NULL as is_verified
FROM telegram_channels
WHERE user_id = 'YOUR_USER_ID';
```

## Need Help?
1. Run `npm run check:telegram-channels` to diagnose
2. Check browser console for detailed logs
3. Look at `TELEGRAM_BROADCAST_FIX.md` for full details
