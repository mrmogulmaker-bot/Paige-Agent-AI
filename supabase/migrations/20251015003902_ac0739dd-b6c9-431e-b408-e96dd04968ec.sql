-- Create storage buckets for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('personal-documents', 'personal-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('business-documents', 'business-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- Create documents tracking table
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL,
  mime_type text NOT NULL,
  bucket_name text NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for documents table
CREATE POLICY "Users can view own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upload own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- Storage RLS policies for personal-documents bucket
CREATE POLICY "Users can view own personal documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'personal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own personal documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'personal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own personal documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'personal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own personal documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'personal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS policies for business-documents bucket
CREATE POLICY "Users can view own business documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own business documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own business documents"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'business-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own business documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'business-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add updated_at trigger
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();