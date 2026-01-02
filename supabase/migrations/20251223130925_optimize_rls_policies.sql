/*
  # Optimize RLS Policies for Performance

  1. Changes
    - Replace auth.uid() with (select auth.uid()) in all RLS policies
    - This prevents re-evaluation of auth.uid() for each row
    - Significantly improves query performance at scale

  2. Tables Updated
    - profiles
    - follows
    - symbols
    - reposts
    - analyses
    - analysis_targets
    - comments
    - likes
    - saves
    - notification_preferences
    - notifications
    - engagement_events
    - telegram_channels
    - telegram_accounts
    - telegram_link_codes
    - notification_delivery_log
    - channel_broadcast_log
    - analysis_ratings
    - admin_settings
*/

-- Drop and recreate profiles policies
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- Drop and recreate follows policies
DROP POLICY IF EXISTS "Users can create own follows" ON follows;
DROP POLICY IF EXISTS "Users can delete own follows" ON follows;

CREATE POLICY "Users can create own follows"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = follower_id);

CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = follower_id);

-- Drop and recreate symbols policies
DROP POLICY IF EXISTS "Analyzers can create symbols" ON symbols;

CREATE POLICY "Analyzers can create symbols"
  ON symbols FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name IN ('analyzer', 'admin')
    )
  );

-- Drop and recreate reposts policies
DROP POLICY IF EXISTS "Users can create reposts" ON reposts;
DROP POLICY IF EXISTS "Users can delete own reposts" ON reposts;

CREATE POLICY "Users can create reposts"
  ON reposts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own reposts"
  ON reposts FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate analyses policies
DROP POLICY IF EXISTS "Analyzers can create analyses" ON analyses;
DROP POLICY IF EXISTS "Analyzers can update own analyses" ON analyses;
DROP POLICY IF EXISTS "Analyzers can delete own analyses" ON analyses;

CREATE POLICY "Analyzers can create analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = analyzer_id AND
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name IN ('analyzer', 'admin')
    )
  );

CREATE POLICY "Analyzers can update own analyses"
  ON analyses FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = analyzer_id)
  WITH CHECK ((select auth.uid()) = analyzer_id);

CREATE POLICY "Analyzers can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = analyzer_id);

-- Drop and recreate analysis_targets policies
DROP POLICY IF EXISTS "Analyzers can create targets for own analyses" ON analysis_targets;
DROP POLICY IF EXISTS "Analyzers can update targets for own analyses" ON analysis_targets;
DROP POLICY IF EXISTS "Analyzers can delete targets for own analyses" ON analysis_targets;

CREATE POLICY "Analyzers can create targets for own analyses"
  ON analysis_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE id = analysis_id
      AND analyzer_id = (select auth.uid())
    )
  );

CREATE POLICY "Analyzers can update targets for own analyses"
  ON analysis_targets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE id = analysis_id
      AND analyzer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE id = analysis_id
      AND analyzer_id = (select auth.uid())
    )
  );

CREATE POLICY "Analyzers can delete targets for own analyses"
  ON analysis_targets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE id = analysis_id
      AND analyzer_id = (select auth.uid())
    )
  );

-- Drop and recreate comments policies
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate likes policies
DROP POLICY IF EXISTS "Users can create likes" ON likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON likes;

CREATE POLICY "Users can create likes"
  ON likes FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own likes"
  ON likes FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate saves policies
DROP POLICY IF EXISTS "Users can view own saves" ON saves;
DROP POLICY IF EXISTS "Users can create saves" ON saves;
DROP POLICY IF EXISTS "Users can delete own saves" ON saves;

CREATE POLICY "Users can view own saves"
  ON saves FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create saves"
  ON saves FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own saves"
  ON saves FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate notification_preferences policies
DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;

CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Drop and recreate notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate engagement_events policies
DROP POLICY IF EXISTS "Users can insert own engagement events" ON engagement_events;
DROP POLICY IF EXISTS "Users can view own engagement events" ON engagement_events;

CREATE POLICY "Users can insert own engagement events"
  ON engagement_events FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can view own engagement events"
  ON engagement_events FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate telegram_channels policies
DROP POLICY IF EXISTS "Analyzers can view own channels" ON telegram_channels;
DROP POLICY IF EXISTS "Analyzers can insert own channels" ON telegram_channels;
DROP POLICY IF EXISTS "Analyzers can update own channels" ON telegram_channels;
DROP POLICY IF EXISTS "Analyzers can delete own channels" ON telegram_channels;

CREATE POLICY "Analyzers can view own channels"
  ON telegram_channels FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Analyzers can insert own channels"
  ON telegram_channels FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Analyzers can update own channels"
  ON telegram_channels FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Analyzers can delete own channels"
  ON telegram_channels FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate analysis_ratings policies
DROP POLICY IF EXISTS "Users can create ratings on others' analyses" ON analysis_ratings;
DROP POLICY IF EXISTS "Users can update own analysis ratings" ON analysis_ratings;
DROP POLICY IF EXISTS "Users can delete own analysis ratings" ON analysis_ratings;

CREATE POLICY "Users can create ratings on others' analyses"
  ON analysis_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id AND
    EXISTS (
      SELECT 1 FROM analyses
      WHERE id = analysis_id
      AND analyzer_id != (select auth.uid())
    )
  );

CREATE POLICY "Users can update own analysis ratings"
  ON analysis_ratings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own analysis ratings"
  ON analysis_ratings FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate telegram_accounts policies
DROP POLICY IF EXISTS "Users can view own telegram account" ON telegram_accounts;
DROP POLICY IF EXISTS "Users can insert own telegram account" ON telegram_accounts;
DROP POLICY IF EXISTS "Users can update own telegram account" ON telegram_accounts;

CREATE POLICY "Users can view own telegram account"
  ON telegram_accounts FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own telegram account"
  ON telegram_accounts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own telegram account"
  ON telegram_accounts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Drop and recreate telegram_link_codes policies
DROP POLICY IF EXISTS "Users can view own link codes" ON telegram_link_codes;
DROP POLICY IF EXISTS "Users can insert own link codes" ON telegram_link_codes;

CREATE POLICY "Users can view own link codes"
  ON telegram_link_codes FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own link codes"
  ON telegram_link_codes FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Drop and recreate notification_delivery_log policies
DROP POLICY IF EXISTS "Users can view own delivery logs" ON notification_delivery_log;

CREATE POLICY "Users can view own delivery logs"
  ON notification_delivery_log FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate channel_broadcast_log policies
DROP POLICY IF EXISTS "Analyzers can view own broadcast logs" ON channel_broadcast_log;

CREATE POLICY "Analyzers can view own broadcast logs"
  ON channel_broadcast_log FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Drop and recreate admin_settings policies
DROP POLICY IF EXISTS "Admins can view all settings" ON admin_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON admin_settings;
DROP POLICY IF EXISTS "Admins can update settings" ON admin_settings;

CREATE POLICY "Admins can view all settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name = 'admin'
    )
  );

CREATE POLICY "Admins can insert settings"
  ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name = 'admin'
    )
  );

CREATE POLICY "Admins can update settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = (select auth.uid())
      AND r.name = 'admin'
    )
  );
