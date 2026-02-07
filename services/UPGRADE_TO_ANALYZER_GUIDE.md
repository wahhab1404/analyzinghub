# 🚀 Upgrade Your Account to Analyzer

## Quick Fix - Get Access to Reports

To access the **Reports** feature (with daily/weekly/monthly options), you need the **Analyzer** role.

---

## ⚡ Quick Upgrade (30 seconds)

### Step 1: Find Your Email
The email you used to register/login to the platform.

### Step 2: Run the Upgrade Script
```bash
npm run upgrade:analyzer your@email.com
```

**Example:**
```bash
npm run upgrade:analyzer alnasserfahad333@gmail.com
```

### Step 3: Log Out and Log Back In
1. Click your profile menu
2. Click "Log Out"
3. Log back in with your credentials
4. Navigate to `/dashboard/reports`
5. You'll now see the full reports interface with all options!

---

## ✅ What You'll See After Upgrade

### Before (Current):
```
⚠️ Access Denied
Reports are only available to Analyzers and Admins.
Your current role: [Some Other Role]
```

### After (Analyzer):
```
┌─────────────────────────────────────────────┐
│  Reports                        [Settings]  │
│  Generate and manage trading reports        │
├─────────────────────────────────────────────┤
│  Generate New Report                        │
│                                              │
│  Report Type:                                │
│    • Daily                                   │
│    • Weekly    ← NOW AVAILABLE!             │
│    • Monthly   ← NOW AVAILABLE!             │
│    • Custom    ← NOW AVAILABLE!             │
│                                              │
│  Date: [Select Date]                         │
│  Language: [English / Arabic / Both]         │
│                                              │
│  [Generate Report]                           │
├─────────────────────────────────────────────┤
│  Your Generated Reports                      │
│  (List of all your reports)                  │
└─────────────────────────────────────────────┘
```

---

## 📊 What You Can Do as an Analyzer

### 1. Generate Reports
- **Daily Reports** - Single day performance
- **Weekly Reports** - 5 trading days (Mon-Fri)
- **Monthly Reports** - Full month analysis
- **Custom Period** - Any date range you choose

### 2. Report Languages
- English only
- Arabic only
- Both languages (dual)

### 3. Automated Delivery
- Schedule automatic daily reports
- Send to Telegram channels
- Set preferred time and timezone
- Choose which channels receive reports

### 4. PDF Reports
- Professional formatted PDFs
- Beautiful charts and statistics
- Downloadable and shareable
- Auto-generated snapshots

### 5. Performance Tracking
- Win/Loss ratios
- Total profit/loss
- Success rate
- Trade statistics
- Contract performance

---

## 🔧 Troubleshooting

### "User not found"
Make sure you're using the exact email you registered with.

### "Still seeing Access Denied after upgrade"
1. Make sure you logged out completely
2. Clear browser cache
3. Log back in
4. Hard refresh the page (Ctrl+Shift+R)

### "Script error"
Make sure you're in the project directory:
```bash
cd /path/to/project
npm run upgrade:analyzer your@email.com
```

---

## 📝 Manual Upgrade (Alternative Method)

If the script doesn't work, you can upgrade via SQL:

```sql
-- 1. Find your user ID
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- 2. Get the Analyzer role ID
SELECT id, name FROM roles WHERE name = 'Analyzer';

-- 3. Update your role
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE id = 'your-user-id-from-step-1';
```

---

## 🎯 Summary

**Command:**
```bash
npm run upgrade:analyzer your@email.com
```

**Time:** 30 seconds
**Logout Required:** Yes
**Access:** Full reports with daily/weekly/monthly options

Once upgraded, you'll have complete access to the Reports feature with all period types available!
