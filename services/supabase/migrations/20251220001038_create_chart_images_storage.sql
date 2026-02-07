/*
  # Create Chart Images Storage Bucket

  1. Storage
    - Create `chart-images` bucket for storing uploaded chart images
    - Set bucket to public for easy image access
    
  2. Security
    - Enable RLS on storage.objects
    - Allow authenticated users to upload their own chart images
    - Allow public read access to all chart images
    - Users can only delete their own uploads
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('chart-images', 'chart-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload chart images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chart-images');

CREATE POLICY "Anyone can view chart images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'chart-images');

CREATE POLICY "Users can delete their own chart images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'chart-images' AND auth.uid()::text = (storage.foldername(name))[1]);
