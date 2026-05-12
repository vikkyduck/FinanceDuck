-- Create storage bucket RLS policies for invoice-documents

-- Policy 1: Restrict uploads to authorized users
CREATE POLICY "Authorized users can upload invoice documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'invoice-documents' AND
  (
    -- Admin or Assistant can upload
    is_admin(get_session_token_id()) OR
    is_assistant(get_session_token_id()) OR
    -- Partners can upload to their invoices
    EXISTS (
      SELECT 1 FROM invoices
      WHERE id::text = (string_to_array(name, '/'))[1]
      AND partner_id = get_token_partner_id(get_session_token_id())
    )
  )
);

-- Policy 2: Restrict downloads to authorized users
CREATE POLICY "Users can download documents for their invoices"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoice-documents' AND
  (
    -- Admin or Assistant can download all
    is_admin(get_session_token_id()) OR
    is_assistant(get_session_token_id()) OR
    -- Partners can download from their invoices
    EXISTS (
      SELECT 1 FROM invoices
      WHERE id::text = (string_to_array(name, '/'))[1]
      AND partner_id = get_token_partner_id(get_session_token_id())
    ) OR
    -- Clients can download from their invoices
    EXISTS (
      SELECT 1 FROM invoices
      WHERE id::text = (string_to_array(name, '/'))[1]
      AND client_id = get_token_client_id(get_session_token_id())
    )
  )
);

-- Policy 3: Only admins/assistants can delete
CREATE POLICY "Only admins can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'invoice-documents' AND
  (is_admin(get_session_token_id()) OR is_assistant(get_session_token_id()))
);

-- Policy 4: Only admins/assistants can update
CREATE POLICY "Only admins can update documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'invoice-documents' AND
  (is_admin(get_session_token_id()) OR is_assistant(get_session_token_id()))
);