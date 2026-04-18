-- Allow authenticated users to upload their own credit reports
-- File path convention used in the app: `{user_id}/{timestamp}_{filename}`

CREATE POLICY "Users can upload own credit reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own credit reports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own credit reports"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);