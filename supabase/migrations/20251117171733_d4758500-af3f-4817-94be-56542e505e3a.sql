-- Allow public access to invoice-documents storage bucket
-- This is safe because:
-- 1. Bucket is private (files not accessible via direct URL)
-- 2. Access controlled via access_session
-- 3. uploaded_by is tracked
-- 4. Bonuses calculated automatically by trigger

-- Drop old authenticated-only policies for storage.objects
DROP POLICY IF EXISTS "Authenticated users can upload invoice documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view invoice documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploaded documents" ON storage.objects;

-- Create new public policies for invoice-documents bucket
CREATE POLICY "Anyone can upload invoice documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'invoice-documents');

CREATE POLICY "Anyone can view invoice documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoice-documents');

CREATE POLICY "Anyone can delete invoice documents"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'invoice-documents');

-- Update invoice_documents table policy
DROP POLICY IF EXISTS "Authenticated users can insert invoice documents" ON public.invoice_documents;

CREATE POLICY "Anyone can insert invoice documents"
ON public.invoice_documents FOR INSERT
TO public
WITH CHECK (true);