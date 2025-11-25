-- Add DELETE policies for invoices table
CREATE POLICY "Admins can delete invoices"
ON public.invoices
FOR DELETE
USING (is_admin(get_session_token_id()));

CREATE POLICY "Assistants can delete invoices"
ON public.invoices
FOR DELETE
USING (is_assistant(get_session_token_id()));