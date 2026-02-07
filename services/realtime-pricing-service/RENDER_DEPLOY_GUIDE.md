# Deploy Realtime Pricing Service to Render

## Step 1: Create Render Account

1. Go to https://render.com
2. Click **Sign Up**
3. Sign up with GitHub (recommended - easier deployment)

## Step 2: Connect GitHub Repository

1. After signing in, click **New +** (top right)
2. Select **Background Worker**
3. Click **Connect GitHub**
4. Authorize Render to access your repositories
5. Select your repository: `analyzinghub` (or whatever your repo is named)

## Step 3: Configure the Service

Fill in these settings:

### Basic Settings
- **Name:** `indices-hub-realtime` (or any name you like)
- **Region:** Choose closest to your users (e.g., Oregon USA, Frankfurt EU)
- **Branch:** `main` (or your default branch)
- **Root Directory:** `realtime-pricing-service`

### Build Settings
- **Build Command:**
  ```bash
  npm install
  ```

- **Start Command:**
  ```bash
  npm start
  ```

### Instance Type
- Select **Free** (512 MB RAM, sleeps after 15 min inactivity)
- OR **Starter $7/month** (512 MB RAM, always on - recommended for production)

## Step 4: Add Environment Variables

Click **Advanced** → **Add Environment Variable**

Add these 4 variables:

| Key | Value | Where to Get It |
|-----|-------|-----------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | Supabase Dashboard → Project Settings → API → service_role (secret) |
| `POLYGON_API_KEY` | Your Polygon.io API key | Polygon.io Dashboard |
| `PORT` | `10000` | Default Render port |

## Step 5: Deploy

1. Click **Create Background Worker**
2. Render will automatically:
   - Clone your repo
   - Run `npm install`
   - Start the service
3. Wait 2-3 minutes for first build

## Step 6: Check Deployment Status

1. You'll see the deployment logs in real-time
2. Wait for: `✓ Build successful`
3. Then: `Service is live`
4. Check logs for: `WebSocket server started on port 10000`

## Step 7: Update Your Frontend

Your WebSocket URL will be:
```
wss://indices-hub-realtime.onrender.com
```

Update this in your frontend code where you connect to WebSocket.

## Step 8: Test Connection

Run this from your project root:
```powershell
npm run verify:cron
```

## Troubleshooting

### Service Won't Start
- Check logs in Render dashboard
- Verify all 4 environment variables are set correctly
- Ensure `PORT=10000` is set

### Free Tier Sleeps
- Free tier services sleep after 15 min of inactivity
- First request takes ~30 seconds to wake up
- Upgrade to Starter ($7/month) for always-on

### Build Fails
- Check that `package.json` exists in `realtime-pricing-service/`
- Verify Node.js version compatibility

## Render vs Fly.io

| Feature | Render Free | Render Starter | Fly.io |
|---------|-------------|----------------|--------|
| Price | Free | $7/month | ~$5/month |
| RAM | 512 MB | 512 MB | 256 MB |
| Always On | No (sleeps) | Yes | Yes |
| Cold Start | ~30s | N/A | N/A |
| Easy Setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

## Recommendation

- **Testing:** Use Render Free
- **Production:** Use Render Starter ($7/month) for reliable 24/7 service
