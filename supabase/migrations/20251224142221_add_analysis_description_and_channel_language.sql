/*
  # Add Analysis Description and Channel Language Preference

  1. Changes
    - Add description field to analyses table for detailed analysis descriptions
    - Add language field to telegram_channels table for broadcast language preference
    - Support English, Arabic, or Both languages

  2. Security
    - Maintain existing RLS policies
    - Description is publicly viewable like other analysis fields
*/

-- Add description field to analyses table
ALTER TABLE analyses 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add language preference to telegram_channels table
ALTER TABLE telegram_channels 
ADD COLUMN IF NOT EXISTS broadcast_language TEXT DEFAULT 'en' 
CHECK (broadcast_language IN ('en', 'ar', 'both'));

COMMENT ON COLUMN analyses.description IS 'Detailed description of the analysis';
COMMENT ON COLUMN telegram_channels.broadcast_language IS 'Language preference for channel broadcasts: en (English), ar (Arabic), or both';
