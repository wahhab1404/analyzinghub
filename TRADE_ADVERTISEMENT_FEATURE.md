# Trade Advertisement Feature

## Overview
This feature allows analyzers to send their successful trades as advertisements to their own Telegram channels. Each analyzer can configure their own advertisement channels and promote their winning trades with beautiful Arabic-formatted messages.

## Features

### 1. Personal Advertisement Channels
- Each analyzer manages their own ad channels
- Add/remove Telegram channels for advertisements
- Enable/disable channels without deleting them
- Channels can be:
  - Public channels (username format: @channelname)
  - Private channels (ID format: -100123456789)

### 2. Send Trade Advertisements
- Available for all trades with positive profit
- Analyzer can only advertise their own trades
- Sends formatted message with:
  - Index symbol
  - Contract details (Strike, Expiry, Option Type)
  - Entry price
  - Highest price reached
  - Profit in dollars (calculated as: (high - entry) × quantity × 100)
  - Profit percentage
  - Contract snapshot image (if available)

### 3. Message Format (Arabic)
```
🎯 تحليل ناجح

المؤشر: SPX
العقد: 6900 - 01/31 - PUT

💰 النتائج:
سعر الدخول: $4.00
أعلى سعر: $4.40
المكسب: $40.00 (+10.0%)

✅ انضم لقناتنا للحصول على التحليلات الفائزة!
```

## Setup Guide

### Step 1: Configure Your Advertisement Channels

1. Navigate to **Dashboard → Settings → Channel** tab
2. Scroll to **إعلانات الصفقات - Advertisement Channels** section
3. Click **Add Channel**
4. Enter:
   - **Channel ID**: @yourchannelname or -100123456789
   - **Display Name**: Friendly name for the channel
5. Click **Add Channel**

**Note**: You must add the bot as an admin to your channel with permission to post messages.

### Step 2: Get Your Channel ID

For private channels:
1. Forward a message from your channel to [@userinfobot](https://t.me/userinfobot)
2. Copy the channel ID (format: -100123456789)

For public channels:
- Use your channel username with @ (e.g., @mychannel)

### Step 3: Send Advertisement

1. Navigate to **Dashboard → Indices**
2. Find one of your trades with positive profit
3. Click the purple **Send** button
4. Select which of your channels to send to
5. Click **إرسال الإعلان** (Send Advertisement)

## API Endpoints

### Get Your Ad Channels
```
GET /api/telegram/ad-channels
Returns: Only channels belonging to authenticated user
```

### Add Ad Channel
```
POST /api/telegram/ad-channels
Body: { "channelId": "@channel", "channelName": "My Channel" }
Note: Automatically linked to authenticated user
```

### Update Ad Channel
```
PATCH /api/telegram/ad-channels
Body: { "id": "uuid", "isActive": true }
Note: Can only update own channels
```

### Delete Ad Channel
```
DELETE /api/telegram/ad-channels?id=uuid
Note: Can only delete own channels
```

### Send Trade Advertisement
```
POST /api/telegram/send-trade-ad
Body: { "tradeId": "uuid", "channelIds": ["@channel1", "-100123456789"] }
Note: User can only advertise their own trades
```

## Database Schema

### telegram_ad_channels
```sql
- id (uuid, PK)
- user_id (uuid, FK to profiles) - Owner of the channel
- channel_id (text) - Telegram channel ID or username
- channel_name (text) - Display name
- is_active (boolean) - Whether channel is active
- created_at (timestamptz)
- updated_at (timestamptz)

UNIQUE INDEX: (user_id, channel_id)
```

## Edge Function

**Function**: `send-trade-advertisement`
- Validates user owns the trade
- Fetches trade details from database
- Calculates profit (with × 100 multiplier for contract value)
- Formats Arabic message
- Sends to user's selected channels via Telegram Bot API
- Returns success/failure status for each channel

## Security

- RLS policies ensure users can only:
  - View their own ad channels
  - Create channels for themselves
  - Update/delete only their channels
  - Advertise only their own trades
- Service role policies for edge function access
- Ownership validation at all levels

## UI Components

1. **AdChannelsSettings** (`components/settings/AdChannelsSettings.tsx`)
   - Located in Dashboard → Settings → Channel tab
   - Manage personal advertisement channels
   - Add, edit, toggle, delete channels

2. **SendTradeAdDialog** (`components/indices/SendTradeAdDialog.tsx`)
   - Select from user's own channels
   - Send trade as advertisement

3. **TradesList** (updated)
   - Purple "Send" button for profitable trades
   - Available to all users on their own trades
   - Opens SendTradeAdDialog

## Use Cases

### For Analyzers
- Promote successful trades to grow audience
- Show real trading results to potential subscribers
- Build credibility with verified profit screenshots
- Drive traffic from public channels to subscription channels

### Example Workflow
1. Analyzer posts a trade analysis
2. Trade becomes profitable
3. Analyzer clicks "Send" button
4. Selects their public announcement channel
5. Profitable trade is automatically shared
6. New followers see the success and subscribe

## Notes

- Contract value multiplier is 100 per point
- Only active channels receive advertisements
- Edge function handles multiple channels in batch
- Message includes contract image if available
- All text is in Arabic for target audience
- Each analyzer controls their own channels independently
- Perfect for building social proof and attracting subscribers
