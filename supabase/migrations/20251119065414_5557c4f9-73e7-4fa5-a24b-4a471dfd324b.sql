-- Enable pgcrypto extension for gen_random_bytes() function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify the function is now available
-- gen_random_bytes() is now usable for secure session token generation