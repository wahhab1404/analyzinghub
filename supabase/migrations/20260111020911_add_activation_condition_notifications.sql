/*
  # Add Activation Condition Notifications

  1. New Functionality
    - Automatically send notifications when activation conditions change status
    - Notify analyzer when condition is met
    - Notify analyzer when pre-activation stop is touched
    - Notify followers/subscribers when analysis becomes active

  2. Implementation
    - Create trigger function to detect status changes
    - Send appropriate notifications based on status change
    - Include condition details in notification

  3. Security
    - Only creates notifications for authenticated users
    - Respects existing notification preferences
*/

-- Function to send activation condition notifications
CREATE OR REPLACE FUNCTION notify_activation_condition_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_analyzer_id uuid;
  v_analysis_title text;
  v_analysis_symbol text;
  v_notification_type text;
  v_notification_title text;
  v_notification_body text;
  v_follower_record record;
BEGIN
  -- Only process if activation is enabled
  IF NOT NEW.activation_enabled THEN
    RETURN NEW;
  END IF;

  v_old_status := OLD.activation_status;
  v_new_status := NEW.activation_status;

  -- Only proceed if status actually changed
  IF v_old_status = v_new_status AND NOT (NEW.preactivation_stop_touched AND NOT OLD.preactivation_stop_touched) THEN
    RETURN NEW;
  END IF;

  -- Get analysis details
  v_analyzer_id := NEW.analyzer_id;
  v_analysis_title := NEW.title;
  v_analysis_symbol := NEW.index_symbol;

  -- Handle pre-activation stop touched
  IF NEW.preactivation_stop_touched AND NOT OLD.preactivation_stop_touched THEN
    v_notification_type := 'analysis_preactivation_stop';
    v_notification_title := 'Pre-Activation Stop Touched';
    v_notification_body := 'Stop loss touched before activation for: ' || v_analysis_symbol || ' - ' || v_analysis_title;

    -- Notify analyzer
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_analyzer_id,
      v_notification_type,
      v_notification_title,
      v_notification_body,
      '/dashboard/analysis/' || NEW.id,
      jsonb_build_object(
        'analysis_id', NEW.id,
        'index_symbol', v_analysis_symbol,
        'activation_price', NEW.activation_price,
        'activation_type', NEW.activation_type
      )
    );
  END IF;

  -- Handle activation condition met (published_inactive -> active)
  IF v_old_status = 'published_inactive' AND v_new_status = 'active' THEN
    v_notification_type := 'analysis_activated';
    v_notification_title := 'Analysis Activated';
    v_notification_body := 'Activation condition met for: ' || v_analysis_symbol || ' - ' || v_analysis_title;

    -- Notify analyzer
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_analyzer_id,
      v_notification_type,
      v_notification_title,
      v_notification_body,
      '/dashboard/analysis/' || NEW.id,
      jsonb_build_object(
        'analysis_id', NEW.id,
        'index_symbol', v_analysis_symbol,
        'activation_price', NEW.activation_price,
        'activation_type', NEW.activation_type,
        'activated_at', NEW.activated_at
      )
    );

    -- Notify followers (if analysis is published and has followers)
    IF NEW.status = 'published' THEN
      FOR v_follower_record IN
        SELECT user_id
        FROM followers
        WHERE following_id = v_analyzer_id
      LOOP
        INSERT INTO notifications (user_id, type, title, body, link, metadata)
        VALUES (
          v_follower_record.user_id,
          'followed_analysis_activated',
          'Analysis Now Active',
          v_analysis_symbol || ' analysis by ' || (SELECT full_name FROM profiles WHERE id = v_analyzer_id LIMIT 1) || ' is now active',
          '/dashboard/analysis/' || NEW.id,
          jsonb_build_object(
            'analysis_id', NEW.id,
            'analyzer_id', v_analyzer_id,
            'index_symbol', v_analysis_symbol
          )
        );
      END LOOP;
    END IF;
  END IF;

  -- Handle completion (active -> completed_success or completed_fail)
  IF v_old_status = 'active' AND (v_new_status = 'completed_success' OR v_new_status = 'completed_fail') THEN
    IF v_new_status = 'completed_success' THEN
      v_notification_title := 'Analysis Completed Successfully';
      v_notification_body := 'Success! ' || v_analysis_symbol || ' - ' || v_analysis_title;
    ELSE
      v_notification_title := 'Analysis Completed';
      v_notification_body := 'Completed: ' || v_analysis_symbol || ' - ' || v_analysis_title;
    END IF;

    -- Notify analyzer
    INSERT INTO notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_analyzer_id,
      'analysis_completed',
      v_notification_title,
      v_notification_body,
      '/dashboard/analysis/' || NEW.id,
      jsonb_build_object(
        'analysis_id', NEW.id,
        'index_symbol', v_analysis_symbol,
        'final_status', v_new_status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_activation_condition_notifications ON analyses;

-- Create trigger for activation condition notifications
CREATE TRIGGER trigger_activation_condition_notifications
  AFTER UPDATE ON analyses
  FOR EACH ROW
  WHEN (OLD.activation_enabled = true AND NEW.activation_enabled = true)
  EXECUTE FUNCTION notify_activation_condition_change();

COMMENT ON FUNCTION notify_activation_condition_change IS 'Sends notifications when activation condition status changes';
COMMENT ON TRIGGER trigger_activation_condition_notifications ON analyses IS 'Triggers notifications when activation conditions change status';
