# AnalyzingHub Platform Structure

## Overview
AnalyzingHub is a social platform for market analysts and traders that automatically validates trading analysis results. Analysts post predictions with target prices and timeframes, and the system tracks real market prices to verify accuracy and calculate success rates.

## Platform Architecture

### Technology Stack
- **Frontend**: Next.js 13 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Server-side)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password, OTP)
- **Integrations**: Telegram Bot, Polygon.io API (Stock Prices)
- **Edge Functions**: Supabase Edge Functions (Deno)

### Key Features
- Auto-validated trading analysis with success rate tracking
- Social features (follow, like, comment, repost)
- Subscription plans for analyzers
- Telegram integration for notifications and channel broadcasting
- Real-time price tracking and validation
- Leaderboards and rankings
- Multi-language support (English & Arabic)

---

## Page Structure

### Public Pages

#### `/` - Landing Page
**Purpose**: Marketing and introduction to the platform
**Features**:
- Hero section with platform value proposition
- Feature highlights
- How it works section
- Rankings preview
- Analysis previews
- Pricing information
- FAQ section
- Navigation to login/register

#### `/login` - Login Page
**Purpose**: User authentication
**Features**:
- Email/password login
- OTP-based login option
- Link to registration page
- Password reset option

#### `/register` - Registration Page
**Purpose**: New user account creation
**Features**:
- Email/password registration
- Username selection
- Account type selection (Analyzer/Trader)
- Email verification

#### `/share/[id]` - Public Analysis View
**Purpose**: Share individual analysis publicly (no login required)
**Features**:
- View analysis details
- Chart image
- Price targets and stop loss
- Current status
- Analyst information
- Call-to-action to join platform

---

### Dashboard Pages (Authenticated)

#### `/dashboard` - Main Dashboard
**Purpose**: User's personalized home feed
**Features**:
- Welcome message
- Quick stats overview
- Recommended analyzers to follow
- Recommended symbols
- Recent activity feed
- Quick actions (create analysis for analyzers)

#### `/dashboard/feed` - Activity Feed
**Purpose**: Social feed of analyses from followed users
**Features**:
- Chronological feed of analyses
- Filter by symbol, direction, timeframe
- Like, comment, repost interactions
- Infinite scroll pagination
- Real-time status updates

#### `/dashboard/profile/[id]` - User Profile
**Purpose**: View user profiles and their content
**Features**:
- User information (avatar, bio, role badge)
- Success rate and statistics
- Subscription plan badge (if offering plans)
- Performance metrics (total analyses, success rate, followers)
- Tabs:
  - **Posts**: User's analyses
  - **Reposts**: Analyses reposted by user
  - **Replies**: User's comments on analyses
- Follow/Unfollow button
- Rate analyzer button (for analyzer profiles)
- Analyzer ratings display
- Subscription plans (for analyzers offering subscriptions)
- Edit profile button (own profile only)

#### `/dashboard/analysis/[id]` - Analysis Detail
**Purpose**: Detailed view of single analysis
**Features**:
- Full analysis information
- Chart image with zoom
- Price tracking (entry, targets, stop loss)
- Current market price
- Success/failure status
- Social interactions (likes, comments, reposts, saves)
- Comment section with replies
- Share functionality
- Edit/delete (for own analyses)
- Download chart image (mobile)

#### `/dashboard/symbol/[symbol]` - Symbol Page
**Purpose**: View all analyses for specific trading symbol
**Features**:
- Symbol information and current price
- List of all analyses for this symbol
- Filter by analyst, direction, timeframe
- Success rate statistics for this symbol
- Related news (if available)

#### `/dashboard/search` - Search Page
**Purpose**: Search for users, analyses, and symbols
**Features**:
- Unified search bar
- Tabs:
  - **Analyses**: Search analysis descriptions and symbols
  - **Users**: Search analysts and traders by name
  - **Symbols**: Search trading symbols
- Advanced filters
- Real-time search results

#### `/dashboard/activity` - Activity Center
**Purpose**: View notifications and user activity
**Features**:
- Notification list (likes, comments, follows, ratings)
- Mark as read/unread
- Mark all as read
- Filter by notification type
- Real-time updates
- Telegram connection status

#### `/dashboard/subscriptions` - Subscriptions Marketplace
**Purpose**: Browse and manage subscription plans
**Features**:
- Tabs:
  - **Browse Plans**: Marketplace of all available subscription plans
    - List of analyzers offering subscriptions
    - Analyst success rates and statistics
    - Click to view analyzer's plans
    - Subscribe to plans
  - **My Subscriptions**: User's active subscriptions
    - Active subscription details
    - Telegram invite links (if applicable)
    - Cancel subscription option
    - Renewal dates

#### `/dashboard/rankings` - Leaderboards
**Purpose**: View top-performing analyzers
**Features**:
- Leaderboard table ranked by success rate
- Filter by timeframe (all time, month, week)
- Analyzer statistics (success rate, total analyses, followers)
- How scoring works explanation
- Follow buttons for each analyzer

#### `/dashboard/create-analysis` - Create Analysis (Analyzers Only)
**Purpose**: Post new trading analysis
**Features**:
- Form fields:
  - Symbol selection (with autocomplete)
  - Direction (Long/Short)
  - Timeframe selection
  - Entry price
  - Target prices (up to 3)
  - Stop loss
  - Chart image upload
  - Analysis description
  - Post type (Analysis/Signal/Educational/News)
  - Visibility (Public/Followers/Subscribers/Private)
  - Chart timeframe (for chart images)
- Image preview
- Real-time validation
- Publish immediately or save as draft

#### `/dashboard/settings` - Settings
**Purpose**: Manage user account and preferences
**Features**:
- Tabs (varies by user role):

  **Profile Tab** (All Users):
  - Update avatar
  - Edit full name, bio
  - Display role badge
  - Tutorial completion status

  **Security Tab** (All Users):
  - Change password
  - Account security settings

  **Notifications Tab** (All Users):
  - Email notification preferences
  - Telegram notification preferences
  - Analysis updates, price alerts, social interactions

  **Telegram Tab** (All Users):
  - Connect Telegram account
  - View connection status
  - Disconnect Telegram
  - Get link code for bot

  **Channel Tab** (Analyzers Only):
  - Connect Telegram channel for broadcasting
  - Configure broadcast settings:
    - New analysis notifications
    - Target hit notifications
    - Stop loss hit notifications
    - Broadcast language (English/Arabic/Both)
  - Channel verification
  - Disconnect channel

  **Plans Tab** (Analyzers Only):
  - Create subscription plans
  - Set pricing (cents), billing interval (month/year)
  - Define plan features
  - Set Telegram channel access
  - Set max subscribers (optional)
  - Activate/deactivate plans
  - View subscriber counts
  - Delete plans (if no active subscribers)

  **Admin Tab** (Admin Only):
  - System-wide settings
  - Telegram bot token configuration
  - Platform configuration

#### `/dashboard/admin` - Admin Dashboard (SuperAdmin Only)
**Purpose**: Platform administration
**Features**:
- Tabs:
  - **Overview**: Platform statistics and metrics
  - **Users**: User management (view, edit roles, ban/activate)
  - **Content**: Content moderation (flag, approve, remove analyses)
  - **Analytics**: Platform analytics and insights
  - **Settings**: System configuration

---

## API Endpoints Structure

### Authentication APIs
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/otp/request` - Request OTP code
- `POST /api/auth/otp/verify` - Verify OTP and login

### User APIs
- `GET /api/me` - Get current user information
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile
- `GET /api/profiles/[id]` - Get specific user profile
- `GET /api/profiles/[id]/posts` - Get user's analyses
- `GET /api/profiles/[id]/reposts` - Get user's reposts
- `GET /api/profiles/[id]/replies` - Get user's comments
- `POST /api/upload-avatar` - Upload user avatar
- `POST /api/change-password` - Change user password
- `POST /api/profile/tutorial-complete` - Mark tutorial as completed

### Analysis APIs
- `GET /api/analyses` - Get analyses feed (with filters)
- `POST /api/analyses` - Create new analysis
- `GET /api/analyses/[id]` - Get specific analysis
- `PUT /api/analyses/[id]` - Update analysis
- `DELETE /api/analyses/[id]` - Delete analysis
- `POST /api/analyses/[id]/like` - Like/unlike analysis
- `POST /api/analyses/[id]/repost` - Repost analysis
- `POST /api/analyses/[id]/save` - Save/unsave analysis
- `GET /api/analyses/[id]/user-like` - Check if user liked
- `GET /api/analyses/[id]/user-repost` - Check if user reposted
- `GET /api/analyses/[id]/user-save` - Check if user saved
- `GET /api/analyses/[id]/stats/likes` - Get like count
- `GET /api/analyses/[id]/stats/reposts` - Get repost count
- `GET /api/analyses/[id]/stats/comments` - Get comment count
- `POST /api/analyses/[id]/comments` - Add comment
- `GET /api/analyses/[id]/ratings` - Get analysis ratings
- `POST /api/upload-chart` - Upload chart image

### Symbol APIs
- `GET /api/search-symbols` - Search trading symbols
- `GET /api/stock-price` - Get real-time stock price
- `GET /api/symbols/[symbol]/analyses` - Get analyses for symbol
- `GET /api/symbols/[symbol]/profile` - Get symbol information
- `GET /api/symbols/[symbol]/news` - Get symbol news
- `POST /api/validate-prices` - Validate analysis prices

### Social APIs
- `POST /api/follow` - Follow/unfollow user
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/[id]` - Mark notification as read
- `POST /api/notifications/mark-all-read` - Mark all as read
- `GET /api/notification-preferences` - Get notification settings
- `PUT /api/notification-preferences` - Update notification settings
- `POST /api/events` - Track user events

### Rating APIs
- `GET /api/ratings/[analyzerId]` - Get analyzer ratings
- `POST /api/ratings/submit` - Submit rating for analyzer
- `GET /api/ratings/user/[analyzerId]` - Get user's rating for analyzer
- `GET /api/ratings` - Get all ratings

### Subscription APIs
- `GET /api/plans` - Get analyzer's subscription plans
- `POST /api/plans` - Create subscription plan (analyzer only)
- `PUT /api/plans/[id]` - Update subscription plan
- `DELETE /api/plans/[id]` - Delete subscription plan
- `GET /api/plans/marketplace` - Get all available plans
- `POST /api/subscriptions/create` - Subscribe to plan
- `POST /api/subscriptions/cancel` - Cancel subscription
- `GET /api/subscriptions/me` - Get user's subscriptions
- `GET /api/subscriptions/check` - Check subscription status

### Rankings APIs
- `GET /api/leaderboards` - Get analyzer leaderboards
- `GET /api/rankings/[id]` - Get specific analyzer ranking
- `POST /api/scoring/recalculate` - Recalculate scores (admin)
- `POST /api/scoring/award` - Award badge (admin)

### Recommendations APIs
- `GET /api/recommendations/analyzers` - Get recommended analyzers
- `GET /api/recommendations/symbols` - Get recommended symbols
- `GET /api/recommendations/feed` - Get recommended feed content

### Search APIs
- `GET /api/search` - Universal search (analyses, users, symbols)

### Telegram APIs
- `GET /api/telegram/status` - Get Telegram connection status
- `POST /api/telegram/link-code` - Generate link code
- `POST /api/telegram/disconnect` - Disconnect Telegram
- `POST /api/telegram/test` - Test Telegram connection
- `POST /api/telegram/setup-webhook` - Setup webhook (admin)
- `POST /api/telegram/webhook` - Telegram webhook endpoint
- `GET /api/telegram/channel/status` - Get channel connection status
- `POST /api/telegram/channel/connect` - Connect Telegram channel
- `POST /api/telegram/channel/disconnect` - Disconnect channel
- `PATCH /api/telegram/channel/settings` - Update channel settings
- `POST /api/telegram/channel/broadcast-new-analysis` - Broadcast analysis

### Admin APIs
- `GET /api/admin/check-auth` - Verify admin access
- `GET /api/admin/stats` - Get platform statistics
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/[id]/role` - Update user role
- `PUT /api/admin/users/[id]/status` - Update user status
- `GET /api/admin/content` - Get content for moderation
- `PUT /api/admin/content/[id]` - Moderate content
- `PUT /api/admin/content/[id]/approve` - Approve content
- `GET /api/admin/analytics` - Get platform analytics
- `GET /api/admin/settings` - Get admin settings
- `PUT /api/admin/settings` - Update admin settings

---

## Database Structure

### Core Tables

**profiles**
- User profile information
- Links to auth.users
- Stores: full_name, bio, avatar_url, role_id, language_preference

**roles**
- User roles: SuperAdmin, Analyzer, Trader

**analyses**
- Trading analyses/predictions
- Stores: symbol_id, direction, entry_price, targets, stop_loss, timeframe, status, visibility

**symbols**
- Trading symbols (stocks, crypto, etc.)
- Stores: symbol, company_name, exchange, asset_type

**price_snapshots**
- Historical price data for validation
- Stores: symbol_id, price, snapshot_at

**analysis_validations**
- Validation results for analyses
- Stores: analysis_id, target_reached, stop_reached, result, validated_at

### Social Tables

**follows**
- User follow relationships
- Stores: follower_id, following_id

**likes**
- Analysis likes
- Stores: user_id, analysis_id

**comments**
- Comments on analyses (with reply support)
- Stores: analysis_id, user_id, content, parent_comment_id

**reposts**
- Analysis reposts
- Stores: user_id, analysis_id, comment

**saves**
- Saved/bookmarked analyses
- Stores: user_id, analysis_id

**notifications**
- User notifications
- Stores: user_id, type, title, message, is_read

### Subscription Tables

**analyzer_plans**
- Subscription plans created by analyzers
- Stores: analyst_id, name, description, price_cents, billing_interval, features, telegram_channel_id, max_subscribers

**subscriptions**
- User subscriptions to plans
- Stores: subscriber_id, analyst_id, plan_id, status, start_at, current_period_end, provider

**telegram_memberships**
- Telegram channel memberships for subscribers
- Stores: subscription_id, channel_id, invite_link, status

### Rating & Ranking Tables

**analyzer_ratings**
- User ratings of analyzers
- Stores: analyzer_id, rater_id, rating (1-5), review, communication_rating, accuracy_rating

**analyzer_stats**
- Cached statistics for analyzers
- Stores: analyzer_id, success_rate, total_analyses, successful_analyses, reputation_score

**badges**
- Achievement badges for analyzers
- Stores: name, description, icon, criteria

**analyzer_badges**
- Badges earned by analyzers
- Stores: analyzer_id, badge_id, earned_at

### Integration Tables

**telegram_users**
- Telegram account connections
- Stores: user_id, telegram_id, telegram_username, chat_id, is_verified

**analyzer_telegram_channels**
- Telegram channel connections for analysts
- Stores: analyzer_id, channel_id, channel_name, notify_new_analysis, notify_target_hit, notify_stop_hit, broadcast_language

**otp_codes**
- One-time passwords for authentication
- Stores: email, code, expires_at

**admin_settings**
- Platform configuration
- Stores: setting_key, setting_value

**engagement_events**
- Analytics and event tracking
- Stores: user_id, event_type, event_data

---

## Edge Functions (Supabase)

### price-validator
**Purpose**: Automatically validate analysis predictions
**Trigger**: Scheduled (every hour)
**Actions**:
- Fetch active analyses
- Get current prices from Polygon API
- Check if targets or stop loss hit
- Update analysis status
- Create notifications
- Send Telegram alerts

### price-alert-checker
**Purpose**: Check for price alerts
**Trigger**: Scheduled (every 5 minutes)
**Actions**:
- Check price movements
- Send alerts to users

### telegram-sender
**Purpose**: Send Telegram messages
**Trigger**: HTTP endpoint
**Actions**:
- Send notification messages to users
- Handle message formatting
- Manage rate limits

### telegram-channel-broadcast
**Purpose**: Broadcast to Telegram channels
**Trigger**: HTTP endpoint
**Actions**:
- Send analysis updates to channels
- Format messages for channels
- Handle multi-language broadcasts

### send-otp-email
**Purpose**: Send OTP codes via email
**Trigger**: HTTP endpoint
**Actions**:
- Generate OTP code
- Send email with code
- Store code in database

---

## Key Components

### UI Components (`/components/ui`)
- Reusable UI components (buttons, cards, dialogs, forms, etc.)
- Built with Radix UI and Tailwind CSS
- Theme-aware (light/dark mode)

### Feature Components

**Analysis Components** (`/components/analysis`)
- `AnalysisCard` - Analysis preview card
- `AnalysisDetailView` - Full analysis display
- `CreateAnalysisForm` - Form to create analysis
- `CommentSection` - Comments and replies
- `StockPrice` - Real-time price display

**Auth Components** (`/components/auth`)
- `LoginForm` - Login interface
- `RegisterForm` - Registration interface
- `OTPLoginForm` - OTP-based login

**Dashboard Components** (`/components/dashboard`)
- `Header` - Top navigation bar
- `Sidebar` - Side navigation menu

**Settings Components** (`/components/settings`)
- `ProfileSettings` - Profile editing
- `SecuritySettings` - Security settings
- `NotificationSettings` - Notification preferences
- `TelegramSettings` - Telegram connection
- `ChannelSettings` - Channel broadcasting
- `PlanManagement` - Subscription plans management

**Subscription Components** (`/components/subscriptions`)
- `SubscriptionPlans` - Display and subscribe to plans
- `MySubscriptions` - Manage user subscriptions

**Rating Components** (`/components/ratings`)
- `RateAnalyzer` - Rate analyzer dialog
- `AnalyzerRatings` - Display ratings
- `StarRating` - Star rating display

**Profile Components** (`/components/profile`)
- `FollowButton` - Follow/unfollow functionality

**Rankings Components** (`/components/rankings`)
- `LeaderboardView` - Leaderboard table
- `ProfileStats` - User statistics
- `HowScoringWorks` - Scoring explanation

---

## Services Layer

### Authentication Service (`/services/auth.service.ts`)
- Handle user authentication
- Session management
- Token validation

### User Service (`/services/user.service.ts`)
- User profile operations
- User data management

### Scoring Service (`/services/scoring/scoring.service.ts`)
- Calculate analyzer scores
- Update rankings
- Award badges

### Recommendation Service (`/services/recommendations/recommendation.service.ts`)
- Generate personalized recommendations
- Suggest analyzers and symbols

### Price Service (`/services/price/price.service.ts`)
- Fetch real-time prices
- Validate analysis prices
- Price history tracking

### Telegram Service (`/services/telegram/telegram.service.ts`)
- Send Telegram messages
- Manage connections
- Handle webhooks

### Validation Service (`/services/validation/validation.service.ts`)
- Validate analysis data
- Check business rules

---

## Security Features

### Row Level Security (RLS)
- All database tables have RLS enabled
- Users can only access their own data or public data
- Analyzers can only manage their own analyses and plans
- Admins have elevated access

### Authentication
- JWT-based authentication via Supabase
- Session management
- Role-based access control (RBAC)
- OTP support for passwordless login

### Data Validation
- Server-side validation for all inputs
- Price validation against market data
- Content moderation capabilities

---

## Multi-language Support

### Supported Languages
- English (en)
- Arabic (ar) - RTL support included

### Translation System
- Centralized translation files
- Context-based translations
- Language switcher in UI
- Language preference saved per user

---

## Notification System

### Notification Types
- New follower
- Analysis liked
- Analysis commented
- Analysis reposted
- Price target hit
- Stop loss hit
- New rating received
- Subscription created/cancelled

### Notification Channels
- In-app notifications
- Telegram messages
- Email notifications (via edge function)

---

## Analytics & Tracking

### User Events Tracked
- Page views
- Analysis views
- Social interactions
- Search queries
- Subscription events

### Performance Metrics
- Success rate calculations
- Ranking updates
- Engagement metrics
- Platform statistics

---

This platform provides a comprehensive ecosystem for trading analysts and traders to connect, share insights, and track performance with automated validation and transparent metrics.
