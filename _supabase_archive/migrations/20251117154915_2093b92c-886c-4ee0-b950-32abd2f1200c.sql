-- Fix RLS policies for access_tokens to allow anonymous login
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Anyone can view access tokens" ON access_tokens;
DROP POLICY IF EXISTS "Authenticated users can use access tokens" ON access_tokens;

-- Create new policies that allow anonymous (anon) access for login flow
CREATE POLICY "Public can view active access tokens"
ON access_tokens FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Public can update access token usage"
ON access_tokens FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);