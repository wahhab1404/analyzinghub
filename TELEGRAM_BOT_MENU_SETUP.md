# Telegram Bot Menu Setup

## Overview

The Telegram bot now has a **full menu system** with enhanced welcome messages and help commands. Users can easily discover all bot features by typing `/` in Telegram.

## Features Added

### 1. Welcome Message (/start)
When users send `/start` without a linking code, they receive a comprehensive welcome message that includes:
- Overview of bot capabilities
- Step-by-step account linking instructions
- Quick start tips
- Available in both English and Arabic

### 2. Help Menu (/help and /menu)
Detailed help menu showing:
- All available commands
- How to search for stock symbols
- Features list
- Rate limits
- Bilingual (English/Arabic)

### 3. Bot Command Menu
Native Telegram command menu that appears when users type `/`:
- `/start` - Link your account and get started
- `/help` - Show help menu with all features
- `/menu` - Display the bot menu
- `/status` - Check if your account is linked

## Setup Instructions

### Step 1: Run the Menu Setup Script

```bash
npm run telegram:menu
```

This will:
- ✅ Configure bot commands in Telegram
- ✅ Set up English menu (default)
- ✅ Set up Arabic menu (for Arabic users)
- ✅ Make commands visible when users type "/"

### Step 2: Verify the Setup

1. Open your Telegram bot
2. Type `/` (just the forward slash)
3. You should see a menu with all commands

### Step 3: Test the Commands

Try each command:
- `/start` - See the welcome message
- `/help` - View the full help menu
- `/menu` - Same as /help
- `/status` - Check link status

## User Experience Flow

### New User Flow
1. **First contact**: User sends `/start` → Receives welcome message
2. **Explore**: User types `/help` → Sees all features
3. **Search**: User sends `AAPL` → Gets instant results
4. **Link account**: User follows instructions to link account

### Linked User Flow
1. **Quick search**: User sends any ticker symbol
2. **Get results**: Bot responds with clickable analysis links
3. **Receive notifications**: User gets real-time updates

## What Each Command Does

### `/start`
- Without code: Shows comprehensive welcome message
- With code: Links user account to Telegram

### `/help` or `/menu`
Shows complete guide including:
- Command list
- How to search symbols
- Feature overview
- Rate limits
- Everything in both languages

### `/status`
- If linked: Shows link date and confirmation
- If not linked: Provides instructions to link

### Stock Symbol Search (no command)
- Just send: `AAPL`, `TSLA`, `2222.SR`, etc.
- Get instant analyses with clickable links
- Pagination for large results

## Technical Details

### Command Registration
Commands are registered using Telegram's `setMyCommands` API:
- Default language: English
- Secondary language: Arabic (`language_code: 'ar'`)
- Telegram shows the appropriate language based on user settings

### Message Format
- Uses HTML parsing mode
- Bold text: `<b>text</b>`
- Code blocks: `<code>text</code>`
- Links: Inline keyboard buttons

### Bilingual Support
All messages include:
1. English version (top)
2. Separator line: `━━━━━━━━━━━━━━━━━━━`
3. Arabic version (bottom)

## Troubleshooting

### Commands not showing in menu?
Run the setup script again:
```bash
npm run telegram:menu
```

### Want to add more commands?
Edit `/scripts/setup-bot-menu.ts` and add to the `commands` array:
```typescript
{
  command: 'newcommand',
  description: 'Description here'
}
```

Then run `npm run telegram:menu` again.

### Change command descriptions?
Same as above - edit the script and re-run.

## Files Modified

1. **app/api/telegram/webhook/route.ts**
   - Enhanced `/start` welcome message
   - Improved `/help` command with full feature list
   - Added `/menu` command (alias for /help)
   - Maintained `/status` command

2. **scripts/setup-bot-menu.ts**
   - New script to register commands with Telegram
   - Supports bilingual command descriptions

3. **package.json**
   - Added `telegram:menu` script

## Next Steps

### For Users
Just open the bot and type `/` - everything is self-explanatory!

### For Admins
1. Run `npm run telegram:menu` once to set up the menu
2. That's it! The menu persists in Telegram
3. Re-run only if you change commands

### For Developers
The bot is now fully featured with:
- ✅ Account linking
- ✅ Symbol search
- ✅ Pagination
- ✅ Rate limiting
- ✅ Notifications
- ✅ Help system
- ✅ Bilingual support

## Resources

- **Test the bot**: Send `/start` to your Telegram bot
- **View logs**: Check Telegram webhook logs
- **Symbol search**: Send any ticker like `AAPL`
- **Full docs**: See `TELEGRAM_SYMBOL_QUERY_GUIDE.md`

---

**Quick Command Reference:**
```bash
npm run telegram:menu    # Set up bot menu
npm run telegram:status  # Check bot status
npm run telegram:setup   # Set up webhook
npm run test:telegram:symbol  # Test symbol search
```
