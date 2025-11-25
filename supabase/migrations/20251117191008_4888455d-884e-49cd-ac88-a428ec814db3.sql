-- Remove unused personal finance tables
-- These tables use auth.uid() which doesn't work with access code authentication system

-- Drop tables with their dependencies
DROP TABLE IF EXISTS public.budgets CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;