-- Fix expired tokens by resetting expires_at to NULL for active tokens
-- This allows existing tokens to continue working
UPDATE access_tokens 
SET expires_at = NULL
WHERE is_active = true;