/*
  # Add password_hash column to otp_codes table

  1. Changes
    - Add `password_hash` column to `otp_codes` table
      - Used to store generated password for passwordless authentication
      - Allows users to authenticate after OTP verification
*/

-- Add password_hash column to otp_codes table
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS password_hash text;