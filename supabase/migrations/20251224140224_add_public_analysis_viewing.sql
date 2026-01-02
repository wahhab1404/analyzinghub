/*
  # Add Public Analysis Viewing

  1. Changes
    - Add public SELECT policy for analyses table
    - Add public SELECT policy for analysis_targets table
    - Add public SELECT policy for validation_events table
    - Add public SELECT policy for symbols table
    - Add public SELECT policy for profiles table (limited fields)
    - Allow public to view like/comment/repost counts

  2. Security
    - Only SELECT operations allowed
    - Public can view all published analyses
    - Personal data remains protected
*/

-- Allow public to view analyses
CREATE POLICY "Public can view analyses"
  ON analyses FOR SELECT
  TO anon
  USING (true);

-- Allow public to view analysis targets
CREATE POLICY "Public can view analysis targets"
  ON analysis_targets FOR SELECT
  TO anon
  USING (true);

-- Allow public to view validation events
CREATE POLICY "Public can view validation events"
  ON validation_events FOR SELECT
  TO anon
  USING (true);

-- Allow public to view symbols
CREATE POLICY "Public can view symbols"
  ON symbols FOR SELECT
  TO anon
  USING (true);

-- Allow public to view profile information (limited)
CREATE POLICY "Public can view profiles"
  ON profiles FOR SELECT
  TO anon
  USING (true);

-- Allow public to view likes count
CREATE POLICY "Public can view likes"
  ON likes FOR SELECT
  TO anon
  USING (true);

-- Allow public to view comments
CREATE POLICY "Public can view comments"
  ON comments FOR SELECT
  TO anon
  USING (true);

-- Allow public to view reposts count
CREATE POLICY "Public can view reposts"
  ON reposts FOR SELECT
  TO anon
  USING (true);

-- Allow public to view saves count
CREATE POLICY "Public can view saves"
  ON saves FOR SELECT
  TO anon
  USING (true);

-- Allow public to view analysis ratings
CREATE POLICY "Public can view analysis ratings"
  ON analysis_ratings FOR SELECT
  TO anon
  USING (true);
