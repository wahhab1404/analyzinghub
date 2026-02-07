# Bolt Environment Variables Setup

Since you're hosting on Bolt with a custom domain, environment variables from your `.env` file should already be available in production through Bolt's system.

## Current Environment Variables

Your `.env` file contains all the necessary variables:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `TELEGRAM_BOT_TOKEN`
- ✅ `TELEGRAM_WEBHOOK_SECRET`
- ✅ `APP_BASE_URL`
- ✅ `POLYGON_API_KEY`
- ✅ SMTP configuration

## Verification

After deployment, verify the environment variables are loaded:

### Debug Endpoint
Visit: `https://anlzhub.com/api/debug/env-check`

Expected response:
```json
{
  "ok": true,
  "environment": "production",
  "missingCount": 0,
  "message": "All environment variables are configured correctly"
}
```

If any variables are missing, it will show which ones in the `missing` array.

## Troubleshooting

If you see "Missing Supabase credentials" errors:

1. **Check Bolt Console Logs**
   - Look for environment variable errors during build or runtime
   - Check if `.env` file is being read

2. **Verify .env File**
   - Ensure `.env` exists in project root
   - No extra spaces or quotes around values
   - File is not in `.gitignore` (though values should be secret)

3. **Rebuild and Redeploy**
   - Sometimes a fresh deployment is needed for env vars to take effect

## Security Note

While `.env` is typically in `.gitignore`, Bolt's system handles environment variables securely. The debug endpoint shows which variables are loaded without exposing their values.

**Important**: Remove or secure the `/api/debug/env-check` endpoint in production as it indicates which environment variables are configured.
