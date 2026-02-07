/*
  # Fix Activation Notifications for Both Tables

  1. Problem
    - The `notify_activation_condition_change()` function references `NEW.index_symbol`
    - This field doesn't exist in `analyses` table (only in `index_analyses`)
    - `analyses` uses `symbol_id` with a foreign key to `symbols` table

  2. Solution
    - Update the function to handle both table structures
    - Use TG_TABLE_NAME to detect which table triggered the function
    - Fetch symbol appropriately based on table
*/

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_activation_condition_notifications ON analyses;
DROP TRIGGER IF EXISTS trigger_activation_condition_notifications_index ON index_analyses;

-- Recreate function with proper handling for both tables
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

  -- Get analysis details based on table
  v_analyzer_id := NEW.analyzer_id;
  
  IF TG_TABLE_NAME = 'index_analyses' THEN
    -- For index_analyses, use index_symbol directly
    v_analysis_symbol := NEW.index_symbol;
    v_analysis_title := NEW.title;
  ELSE
    -- For analyses, fetch symbol from symbols table
    SELECT s.symbol INTO v_analysis_symbol
    FROM symbols s
    WHERE s.id = NEW.symbol_id;
    
    -- analyses table might not have a title field, use a default
    v_analysis_title := COALESCE(NEW.title, 'Analysis');
  END IF;

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
        'symbol', v_analysis_symbol,
        'event', 'preactivation_stop_touched'
      )
    );
    
    RETURN NEW;
  END IF;

  -- Handle activation status change
  IF v_new_status = 'active' AND v_old_status = 'published_inactive' THEN
    v_notification_type := 'analysis_activated';
    v_notification_title := 'Analysis Activated';
    v_notification_body := v_analysis_symbol || ' analysis activated: ' || v_analysis_title;

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
        'symbol', v_analysis_symbol,
        'activation_price', NEW.activation_price,
        'event', 'activated'
      )
    );

    -- Notify followers
    FOR v_follower_record IN 
      SELECT follower_id 
      FROM follows 
      WHERE following_id = v_analyzer_id
    LOOP
      INSERT INTO notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_follower_record.follower_id,
        v_notification_type,
        v_notification_title,
        v_notification_body,
        '/dashboard/analysis/' || NEW.id,
        jsonb_build_object(
          'analysis_id', NEW.id,
          'analyzer_id', v_analyzer_id,
          'symbol', v_analysis_symbol,
          'event', 'activated'
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger for analyses table
CREATE TRIGGER trigger_activation_condition_notifications
  AFTER UPDATE ON analyses
  FOR EACH ROW
  WHEN (OLD.activation_enabled = true AND NEW.activation_enabled = true)
  EXECUTE FUNCTION notify_activation_condition_change();

-- Recreate trigger for index_analyses table
CREATE TRIGGER trigger_activation_condition_notifications_index
  AFTER UPDATE ON index_analyses
  FOR EACH ROW
  WHEN (OLD.activation_enabled = true AND NEW.activation_enabled = true)
  EXECUTE FUNCTION notify_activation_condition_change();

COMMENT ON TRIGGER trigger_activation_condition_notifications ON analyses IS 'Triggers notifications when activation conditions change status on stock analyses';
COMMENT ON TRIGGER trigger_activation_condition_notifications_index ON index_analyses IS 'Triggers notifications when activation conditions change status on index analyses';
