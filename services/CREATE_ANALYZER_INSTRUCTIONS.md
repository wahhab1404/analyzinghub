# Create Analyzer User - Instructions

This guide will help you create the analyzer user account for Fahad Bin Saidan.

## Prerequisites

Before running the script, you need to get the correct Supabase Service Role Key.

## Step 1: Get Your Service Role Key

1. Open your Supabase Dashboard:
   ```
   https://supabase.com/dashboard/project/gbdzhdlpbwrnhykmstic/settings/api
   ```

2. Scroll down to the **Project API keys** section

3. Copy the **service_role** key (the secret one, not the anon key)
   - It starts with `eyJ...` (a long JWT token)
   - Make sure you're copying from your actual Supabase project

## Step 2: Update .env File

1. Open the `.env` file in the project root

2. Set the Service Role Key:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<PASTE_YOUR_SERVICE_ROLE_KEY_HERE>
   ```

3. Save the file

## Step 3: Run the Script

Open your terminal in the project directory and run:

```bash
npm run create:analyzer
```

## Expected Output

If successful, you should see:

```
🚀 Creating analyzer user...
Email: alnasserfahad333@gmail.com
Name: Fahad Bin Saidan
Role: Analyzer

📝 Creating auth user...
✅ Auth user created
User ID: [uuid]

📝 Checking profile creation...
✅ Profile created by trigger

✅ Analyzer user created successfully!

📋 Login Credentials:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: alnasserfahad333@gmail.com
Password: Ff0551187442
Role: Analyzer
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 Please change the password after first login!
```

## Troubleshooting

### Error: "Invalid API key"

This means the `SUPABASE_SERVICE_ROLE_KEY` in your `.env` file is incorrect or from a different project.

**Solution**: Double-check that you copied the correct key from your project dashboard.

### Error: "User already exists"

The email address is already registered in your database.

**Solution**: You can either:
1. Use a different email address
2. Delete the existing user from Supabase Dashboard
3. Use the existing account and reset its password

### Error: "Role 'Analyzer' not found"

The roles table in your database is missing the Analyzer role.

**Solution**: Run your database migrations to ensure all roles are created:
```bash
# Check your Supabase migrations are applied
```

## User Details

Once created, the analyzer can login with:

- **Email**: alnasserfahad333@gmail.com
- **Password**: Ff0551187442
- **Role**: Analyzer

## Features Available to Analyzer

As an Analyzer, this user will be able to:

- ✅ Create and publish market analyses
- ✅ Upload chart images
- ✅ Set target and stop-loss prices
- ✅ Connect Telegram channels for broadcasting
- ✅ Receive ratings and feedback from traders
- ✅ View their performance metrics and success rates
- ✅ Manage their profile and notification settings

## Security Note

Make sure to remind the user to change their password after first login for security purposes.

## Next Steps After User Creation

1. Login to the platform with the credentials
2. Complete profile setup
3. Connect a Telegram channel (optional)
4. Start creating analyses

---

**Need Help?**

If you encounter any issues, check:
- Your Supabase project is active
- Database migrations are up to date
- Environment variables are correctly set
- You have internet connectivity to reach Supabase
