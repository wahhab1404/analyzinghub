/*
  # Update Telegram Broadcast Language Default to Both

  1. Changes
    - Update the default value for `broadcast_language` in `telegram_channels` table from 'en' to 'both'
    - Update all existing records to use 'both' as the language preference
  
  2. Reasoning
    - Users want messages sent in both Arabic and English by default
    - This provides the best user experience for multilingual audiences
    - Existing channels should be updated to reflect this new default behavior
*/

-- Update the default value for new records
ALTER TABLE telegram_channels 
ALTER COLUMN broadcast_language SET DEFAULT 'both';

-- Update existing records that are set to 'en' to use 'both'
UPDATE telegram_channels 
SET broadcast_language = 'both' 
WHERE broadcast_language = 'en';

-- Update comment to reflect new default
COMMENT ON COLUMN telegram_channels.broadcast_language IS 'Language preference for channel broadcasts: en (English), ar (Arabic), or both (default)';