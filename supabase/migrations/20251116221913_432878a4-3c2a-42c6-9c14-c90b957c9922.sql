-- Disable RLS on partners and clients tables
-- Since we're using localStorage-based access control, not Supabase Auth,
-- we don't need RLS on these tables

ALTER TABLE public.partners DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;

-- Drop the existing policies as they're no longer needed
DROP POLICY IF EXISTS "Admins and assistants can manage partners" ON public.partners;
DROP POLICY IF EXISTS "Partners can view their own info" ON public.partners;
DROP POLICY IF EXISTS "Admins and assistants can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Partners can view their clients" ON public.clients;