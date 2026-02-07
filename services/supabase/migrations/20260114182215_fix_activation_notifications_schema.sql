/*
  # Fix Activation Notifications Schema

  1. Problem
    - Previous function used `body`, `link`, `metadata` fields
    - Notifications table uses `message` instead of `body`
    - Doesn't have `link` or `metadata` fields

  2. Solution
    - Update function to use correct schema
    - Use `message` instead of `body`
    - Remove `link` and `metadata` fields
*/

-- Recreate function with correct schema
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
  v_analysis_symbol text;
  v_notification_type text;
  v_notification_title text;
  v_notification_message text;
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

  -- Get analysis details based on table
  v_analyzer_id := NEW.analyzer_id;
  
  IF TG_TABLE_NAME = 'index_analyses' THEN
    -- For index_analyses, use index_symbol directly
    v_analysis_symbol := NEW.index_symbol;
  ELSE
    -- For analyses, fetch symbol from symbols table
    SELECT s.symbol INTO v_analysis_symbol
    FROM symbols s
    WHERE s.id = NEW.symbol_id;
  END IF;

  -- Handle pre-activation stop touched
  IF NEW.preactivation_stop_touched AND NOT OLD.preactivation_stop_touched THEN
    v_notification_type := 'analysis_preactivation_stop';
    v_notification_title := 'Pre-Activation Stop Touched';
    v_notification_message := 'Stop loss touched before activation for ' || v_analysis_symbol;

    -- Notify analyzer
    INSERT INTO notifications (user_id, type, title, message, analysis_id)
    VALUES (
      v_analyzer_id,
      'stop_hit',
      v_notification_title,
      v_notification_message,
      NEW.id
    );
    
    RETURN NEW;
  END IF;

  -- Handle activation status change
  IF v_new_status = 'active' AND v_old_status = 'published_inactive' THEN
    v_notification_type := 'new_analysis';
    v_notification_title := 'Analysis Activated';
    v_notification_message := v_analysis_symbol || ' analysis has been activated';

    -- Notify analyzer
    INSERT INTO notifications (user_id, type, title, message, analysis_id, actor_id)
    VALUES (
      v_analyzer_id,
      v_notification_type,
      v_notification_title,
      v_notification_message,
      NEW.id,
      v_analyzer_id
    );

    -- Notify followers
    FOR v_follower_record IN 
      SELECT follower_id 
      FROM follows 
      WHERE following_id = v_analyzer_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, analysis_id, actor_id)
      VALUES (
        v_follower_record.follower_id,
        v_notification_type,
        v_notification_title,
        v_notification_message,
        NEW.id,
        v_analyzer_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
