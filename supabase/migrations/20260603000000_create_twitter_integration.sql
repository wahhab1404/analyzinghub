/*
  # Twitter (X) Integration — Schema

  Adds per-analyst X (Twitter) account linking and a social-post log so each
  analyst can announce their own successful trades on their own X account.

  ## Tables
  - `twitter_accounts` — one linked X account per analyst (OAuth 2.0 tokens,
                         stored AES-256-GCM encrypted by the app layer).
  - `social_posts`     — log of trades posted to a social platform; the unique
                         (trade_id, platform) constraint prevents double-posting
                         (mirrors the `trade_alerts` dedup pattern for Telegram).

  ## Security
  - RLS: each analyst can only read/write their own `twitter_accounts` row and
    their own `social_posts`. The service role (server routes) bypasses RLS for
    the OAuth callback and the auto-post path.
  - Tokens are NEVER stored in plaintext — the app encrypts them before insert.
*/

-- ────────────────────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE social_platform_enum AS ENUM ('twitter');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE social_post_status_enum AS ENUM ('sent', 'failed', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- TWITTER ACCOUNTS
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS twitter_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One X account per analyst.
  user_id           uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,

  -- X identity (safe to display)
  twitter_user_id   text NOT NULL,
  handle            text,                 -- @username (screen name)
  display_name      text,

  -- OAuth 2.0 tokens — AES-256-GCM encrypted by the app before insert.
  access_token      text NOT NULL,
  refresh_token     text,
  token_expires_at  timestamptz,
  scope             text,

  -- Per-analyst preference: auto-post winning trades when they close.
  auto_post         boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twitter_accounts_user ON twitter_accounts(user_id);

ALTER TABLE twitter_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own twitter account"
    ON twitter_accounts FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own twitter account"
    ON twitter_accounts FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own twitter account"
    ON twitter_accounts FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own twitter account"
    ON twitter_accounts FOR DELETE TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- SOCIAL POSTS (dedup + audit log)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  trade_id    uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  platform    social_platform_enum NOT NULL DEFAULT 'twitter',

  post_id     text,                       -- tweet id
  post_url    text,                       -- https://x.com/<handle>/status/<id>
  status      social_post_status_enum NOT NULL DEFAULT 'pending',
  error       text,

  posted_at   timestamptz NOT NULL DEFAULT now()
);

-- One successful announcement per trade per platform.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_posts_trade_platform
  ON social_posts(trade_id, platform);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own social posts"
    ON social_posts FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- updated_at trigger for twitter_accounts
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_twitter_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER twitter_accounts_updated_at
    BEFORE UPDATE ON twitter_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_twitter_accounts_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
