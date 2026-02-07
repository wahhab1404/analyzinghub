/*
  # Add Analysis Rating Notifications

  ## Overview
  Adds notification support for when someone rates an analysis.

  ## Changes
  - Add trigger for analysis_ratings table to create notifications
  - Backfill notifications for existing ratings
  
  ## Notification Type
  - `new_rating` - Someone rated your analysis

  ## Security
  - Follows existing RLS patterns
  - Only creates notifications when rater != analysis owner
*/

-- Function to create notification for new analysis rating
CREATE OR REPLACE FUNCTION notify_analysis_rating()
RETURNS TRIGGER AS $$
DECLARE
  analysis_owner_id uuid;
BEGIN
  -- Get the owner of the analysis
  SELECT analyzer_id INTO analysis_owner_id
  FROM analyses
  WHERE id = NEW.analysis_id;
  
  -- Notify analysis owner if rating is not from them
  IF analysis_owner_id != NEW.user_id THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      analysis_id,
      rating_id,
      type,
      title,
      message
    ) VALUES (
      analysis_owner_id,
      NEW.user_id,
      NEW.analysis_id,
      NEW.id,
      'new_rating',
      'New Rating',
      (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' rated your analysis ' || NEW.rating || '/10'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for analysis ratings
DROP TRIGGER IF EXISTS trigger_notify_analysis_rating ON analysis_ratings;
CREATE TRIGGER trigger_notify_analysis_rating
  AFTER INSERT ON analysis_ratings
  FOR EACH ROW
  EXECUTE FUNCTION notify_analysis_rating();

-- Backfill notifications for existing analysis ratings
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  rating_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  a.analyzer_id,
  ar.user_id,
  ar.analysis_id,
  ar.id,
  'new_rating',
  'New Rating',
  p.full_name || ' rated your analysis ' || ar.rating || '/10',
  ar.created_at
FROM analysis_ratings ar
JOIN analyses a ON a.id = ar.analysis_id
JOIN profiles p ON p.id = ar.user_id
WHERE a.analyzer_id != ar.user_id
ON CONFLICT DO NOTHING;
