/*
  # Support Multiple Subscriber Channels
  
  1. Changes
    - Remove unique constraint on (user_id, audience_type) to allow multiple channels per type
    - Add `is_platform_default` column to mark which channel is used for platform subscribers
    - Add `plan_id` reference to optionally link channel to a specific plan
    - Add constraint: only one platform default channel per user per audience type
    - Add constraint: a channel cannot be both platform default AND plan-specific
    
  2. Use Cases
    - Platform Default: Channel for general analyzer followers/subscribers (not tied to any plan)
    - Plan-Specific: Channel dedicated to a specific subscription plan
    - Multiple subscriber channels: Analyzer can have multiple subscriber channels, each for different plans
  
  3. Security
    - Maintain existing RLS policies
    - Ensure users can only manage their own channels
*/

-- Drop the existing unique constraint that limits one channel per audience type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_audience_type'
  ) THEN
    ALTER TABLE telegram_channels DROP CONSTRAINT unique_user_audience_type;
  END IF;
END $$;

-- Add is_platform_default column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_channels' AND column_name = 'is_platform_default'
  ) THEN
    ALTER TABLE telegram_channels ADD COLUMN is_platform_default boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add plan_id column to link channel to specific plan (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_channels' AND column_name = 'linked_plan_id'
  ) THEN
    ALTER TABLE telegram_channels ADD COLUMN linked_plan_id uuid REFERENCES analyzer_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add unique constraint: only one platform default channel per user per audience type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_platform_default_per_user_audience'
  ) THEN
    CREATE UNIQUE INDEX unique_platform_default_per_user_audience 
      ON telegram_channels(user_id, audience_type) 
      WHERE is_platform_default = true;
  END IF;
END $$;

-- Add check constraint: cannot be both platform default AND plan-specific
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_platform_or_plan_not_both'
  ) THEN
    ALTER TABLE telegram_channels ADD CONSTRAINT check_platform_or_plan_not_both
      CHECK (
        (is_platform_default = true AND linked_plan_id IS NULL) OR
        (is_platform_default = false)
      );
  END IF;
END $$;

-- Add index for plan-linked channels
CREATE INDEX IF NOT EXISTS idx_telegram_channels_plan_id 
  ON telegram_channels(linked_plan_id) 
  WHERE linked_plan_id IS NOT NULL;

-- Update existing channels to be platform defaults if they're not linked to plans
UPDATE telegram_channels 
SET is_platform_default = true 
WHERE linked_plan_id IS NULL 
  AND is_platform_default = false;

-- Comment on columns
COMMENT ON COLUMN telegram_channels.is_platform_default IS 
  'True if this channel is used for platform-wide broadcasts (followers/subscribers not tied to specific plans)';
  
COMMENT ON COLUMN telegram_channels.linked_plan_id IS 
  'If set, this channel is dedicated to a specific subscription plan. Subscribers to this plan will be added to this channel.';
