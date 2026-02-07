# Quick Deploy: Snapshot Fix

## Deploy Updated Trade Tracker

Run this command to deploy the fixed edge function:

```bash
npx supabase functions deploy indices-trade-tracker --no-verify-jwt
```

## What This Fixes

- ✅ New trades will now show snapshot images in Telegram
- ✅ New highs will send updated snapshot images
- ✅ Winning trades will include snapshot images
- ✅ Trade results will have final snapshot images

## Test It

1. Create a new trade
2. Enable "Auto-publish to Telegram"
3. Submit the trade
4. Check your Telegram channel - the message should now include a snapshot image

## If You Get an Error

If you see "Access token not provided":

1. Run: `npx supabase login`
2. Then retry the deploy command above

## Already Built

The Next.js app is already built and ready - only the edge function needs to be deployed.
