/*
  # Fix RLS Policies for Post Visibility
  
  1. Changes
    - Update "Followers can view follower-only analyses" policy to include owner check
    - Update "Subscribers can view subscriber-only analyses" policy to include owner check
    
  2. Reason
    - Currently, owners (analyzers) cannot see their own follower-only or subscriber-only posts
    - The policies only check for followers/subscribers but not for the post owner
    - This prevents analyzers from viewing their own content
    
  3. Solution
    - Add `analyzer_id = auth.uid()` check to both policies
    - This ensures owners can always see their own posts regardless of visibility level
*/

-- Drop existing visibility policies
DROP POLICY IF EXISTS "Followers can view follower-only analyses" ON analyses;
DROP POLICY IF EXISTS "Subscribers can view subscriber-only analyses" ON analyses;

-- Recreate policy for followers-only analyses with owner check
CREATE POLICY "Followers can view follower-only analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    visibility = 'followers'
    AND (
      analyzer_id = auth.uid()  -- Owner can always see their own posts
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = auth.uid()
        AND f.following_id = analyses.analyzer_id
      )
    )
  );

-- Recreate policy for subscribers-only analyses with owner check
CREATE POLICY "Subscribers can view subscriber-only analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (
    visibility = 'subscribers'
    AND (
      analyzer_id = auth.uid()  -- Owner can always see their own posts
      OR has_active_subscription(auth.uid(), analyses.analyzer_id)
    )
  );
