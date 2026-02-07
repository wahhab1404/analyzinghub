/*
  # Add Activation Condition Notifications to Index Analyses

  1. New Functionality
    - Apply the same notification logic to index_analyses table
    - Notify when activation conditions change status
    - Use same trigger function with index_analyses

  2. Implementation
    - Create trigger for index_analyses table using existing function
*/

-- Create trigger for index_analyses table (reusing the same function)
DROP TRIGGER IF EXISTS trigger_activation_condition_notifications_index ON index_analyses;

CREATE TRIGGER trigger_activation_condition_notifications_index
  AFTER UPDATE ON index_analyses
  FOR EACH ROW
  WHEN (OLD.activation_enabled = true AND NEW.activation_enabled = true)
  EXECUTE FUNCTION notify_activation_condition_change();

COMMENT ON TRIGGER trigger_activation_condition_notifications_index ON index_analyses IS 'Triggers notifications when activation conditions change status on index analyses';
