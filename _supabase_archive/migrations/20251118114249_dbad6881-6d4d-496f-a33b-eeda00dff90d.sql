-- Allow admins and assistants to delete partners
CREATE POLICY "Admins can delete partners"
ON public.partners
FOR DELETE
USING (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can delete partners"
ON public.partners
FOR DELETE
USING (is_assistant(get_session_token_id()));

-- Allow admins and assistants to delete clients
CREATE POLICY "Admins can delete clients"
ON public.clients
FOR DELETE
USING (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can delete clients"
ON public.clients
FOR DELETE
USING (is_assistant(get_session_token_id()));
