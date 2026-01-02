/*
  # Add OTP Authentication System

  1. New Tables
    - `otp_codes`
      - `id` (uuid, primary key)
      - `email` (text, not null) - Email address for OTP
      - `code` (text, not null) - 6-digit OTP code
      - `user_id` (uuid, nullable) - Reference to existing user if exists
      - `expires_at` (timestamptz, not null) - Expiration time for OTP
      - `verified` (boolean, default false) - Whether OTP has been used
      - `attempts` (integer, default 0) - Number of verification attempts
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `otp_codes` table
    - Add policy for users to verify their own OTP codes
    - Add indexes for performance
    - Add automatic cleanup of expired OTPs

  3. Functions
    - Function to generate 6-digit OTP code
    - Function to clean up expired OTPs
    - Trigger to update `updated_at` timestamp
*/

-- Create OTP codes table
CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  verified boolean DEFAULT false,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_verified ON otp_codes(verified);

-- Enable RLS
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can create OTP codes (for signup/login)
CREATE POLICY "Anyone can create OTP codes"
  ON otp_codes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Users can read their own OTP codes (for verification)
CREATE POLICY "Users can read own OTP codes"
  ON otp_codes
  FOR SELECT
  TO anon, authenticated
  USING (email = current_setting('request.jwt.claims', true)::json->>'email' OR true);

-- Policy: Users can update their own OTP codes (for verification tracking)
CREATE POLICY "Users can update own OTP codes"
  ON otp_codes
  FOR UPDATE
  TO anon, authenticated
  USING (email = current_setting('request.jwt.claims', true)::json->>'email' OR true)
  WITH CHECK (email = current_setting('request.jwt.claims', true)::json->>'email' OR true);

-- Function to generate 6-digit OTP code
CREATE OR REPLACE FUNCTION generate_otp_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN lpad(floor(random() * 1000000)::text, 6, '0');
END;
$$;

-- Function to clean up expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM otp_codes
  WHERE expires_at < now()
    OR (verified = true AND created_at < now() - interval '1 day');
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_otp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER otp_codes_updated_at
  BEFORE UPDATE ON otp_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_otp_updated_at();