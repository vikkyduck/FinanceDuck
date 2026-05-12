-- Drop remaining old policies on user_roles
DROP POLICY IF EXISTS "Access tokens can view their roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;