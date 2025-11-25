-- Add INSERT policy for access_tokens so admins can create new codes
CREATE POLICY "Authenticated users can create access tokens"
ON public.access_tokens
FOR INSERT
WITH CHECK (true);