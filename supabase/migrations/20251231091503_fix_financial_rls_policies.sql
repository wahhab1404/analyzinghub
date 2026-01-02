/*
  # Fix Financial Management RLS Policies
  
  1. RLS Policies Added
    - Allow analysts to read their own earnings summary
    - Allow analysts to read their own financial transactions  
    - Allow analysts to read subscriptions where they are the analyst
    - Allow service role full access for backend operations
    
  2. Security
    - Policies ensure analysts can only see their own financial data
    - Service role access for automated processes
*/

-- Allow analysts to read their own earnings summary
DROP POLICY IF EXISTS "Analysts can view own earnings" ON analyst_earnings_summary;
CREATE POLICY "Analysts can view own earnings"
  ON analyst_earnings_summary FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

-- Allow service role to manage earnings summaries
DROP POLICY IF EXISTS "Service role can manage earnings summaries" ON analyst_earnings_summary;
CREATE POLICY "Service role can manage earnings summaries"
  ON analyst_earnings_summary FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow analysts to read their own transactions
DROP POLICY IF EXISTS "Analysts can view own transactions" ON financial_transactions;
CREATE POLICY "Analysts can view own transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid());

-- Allow service role to manage transactions
DROP POLICY IF EXISTS "Service role can manage transactions" ON financial_transactions;
CREATE POLICY "Service role can manage transactions"
  ON financial_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow analysts to view subscriptions where they are the analyst
DROP POLICY IF EXISTS "Analysts can view own subscriptions" ON subscriptions;
CREATE POLICY "Analysts can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (analyst_id = auth.uid() OR subscriber_id = auth.uid());

-- Allow service role to manage subscriptions
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);