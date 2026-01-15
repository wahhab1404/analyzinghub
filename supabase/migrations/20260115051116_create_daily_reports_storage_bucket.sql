/*
  # Create Daily Reports Storage Bucket

  1. Storage Setup
    - Create `daily-reports` bucket for storing HTML reports
    - Public bucket with proper RLS policies
  
  2. Security
    - Analyzers can upload their own reports
    - Anyone can read reports (public access)
    - Service role has full access
*/

-- Create the daily-reports bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-reports',
  'daily-reports',
  true,
  10485760, -- 10MB limit
  ARRAY['text/html']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist and recreate them
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Service role full access to daily-reports" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload their own reports" ON storage.objects;
  DROP POLICY IF EXISTS "Public read access to daily reports" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own reports" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own reports" ON storage.objects;
END $$;

-- Allow service role full access to daily-reports bucket
CREATE POLICY "Service role full access to daily-reports"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'daily-reports');

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'daily-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all reports
CREATE POLICY "Public read access to daily reports"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'daily-reports');

-- Allow users to update/delete their own reports
CREATE POLICY "Users can update their own reports"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'daily-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own reports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'daily-reports' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
