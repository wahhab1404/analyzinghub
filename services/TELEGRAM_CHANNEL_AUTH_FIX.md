# Telegram Channel Authentication Fix

## Issue
When trying to connect a new Telegram channel, users were encountering two errors:

1. **First Error**: "You already have a public channel connected. Disconnect it first."
2. **Second Error**: "401 Unauthorized"

## Root Cause

### First Error (Already Connected)
The system only allows one channel per audience type (public, followers, subscribers). Users were trying to connect a second public channel without disconnecting the first one.

### Second Error (Unauthorized)
All telegram channel API routes were using `createServerClient()` instead of `createRouteHandlerClient(request)`, which doesn't properly handle authentication in Next.js route handlers.

## Files Fixed

### 1. Authentication Fix
Updated the following files to use proper route handler authentication:

- `app/api/telegram/channel/connect/route.ts`
- `app/api/telegram/channel/disconnect/route.ts`
- `app/api/telegram/channel/settings/route.ts`
- `app/api/telegram/channel/status/route.ts`

Changed from:
```typescript
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();
```

To:
```typescript
import { createRouteHandlerClient } from '@/lib/api-helpers';
const supabase = createRouteHandlerClient(request);
```

### 2. UI Improvements
Enhanced `components/settings/ChannelSettings.tsx`:

- Added blue info alert explaining the one-channel-per-type limitation
- Added "(Already Connected)" label to disabled dropdown options
- Added client-side validation before API calls
- Auto-selects first available channel type when loading

## Channel System Rules

You can connect up to 3 channels, one for each audience type:

1. **Public Channel** - Broadcasts all public posts to all followers
2. **Followers Channel** - Broadcasts follower-only posts
3. **Subscribers Channel** - Broadcasts subscriber-only posts

## How to Use

### To Connect a Channel:
1. Go to Settings > Telegram Channel Broadcasting
2. Select an available channel type from the dropdown
3. Enter your channel ID or username
4. Click "Connect"

### To Replace a Channel:
1. Find the channel you want to replace
2. Click "Disconnect"
3. Connect a new channel with the same audience type

### To Add Additional Channels:
If you have less than 3 channels connected, you can add more by selecting an available audience type from the "Add Another Channel" section.

## Helper Script

A new script has been added to check your connected channels:

```bash
npm run check:channels <user-id>
```

This will show:
- All currently connected channels
- Channel settings (notifications, language)
- Available channel slots

## Technical Details

### Why createRouteHandlerClient?

Next.js route handlers require proper cookie handling for authentication. The `createRouteHandlerClient(request)` function:

1. Properly reads authentication cookies from the request
2. Maintains session state across requests
3. Handles cookie modifications through middleware
4. Works correctly with Supabase's SSR authentication

Using `createServerClient()` in route handlers causes authentication to fail because it doesn't properly access the request cookies.

## Testing

Build verified successfully with all fixes applied:
```bash
npm run build
```

All routes now properly authenticate users before processing channel operations.
