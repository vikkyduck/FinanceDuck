-- Drop the permissive policy that allows anyone to view all roles
DROP POLICY IF EXISTS "Anyone can view user roles" ON user_roles;

-- Create restrictive SELECT policies
CREATE POLICY "Users can view own role"
ON user_roles FOR SELECT
TO authenticated
USING (access_token_id = get_session_token_id());

CREATE POLICY "Admins can view all roles"
ON user_roles FOR SELECT
TO authenticated
USING (is_admin(get_session_token_id()));

-- Create admin-only management policies
CREATE POLICY "Admins can insert roles"
ON user_roles FOR INSERT
TO authenticated
WITH CHECK (is_admin(get_session_token_id()));

CREATE POLICY "Admins can update roles"
ON user_roles FOR UPDATE
TO authenticated
USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can delete roles"
ON user_roles FOR DELETE
TO authenticated
USING (is_admin(get_session_token_id()));