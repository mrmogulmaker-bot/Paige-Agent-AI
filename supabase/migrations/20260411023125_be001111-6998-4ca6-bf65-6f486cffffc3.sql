
-- Create credit report uploads table
CREATE TABLE public.credit_report_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'consumer' CHECK (report_type IN ('consumer', 'business')),
  bureau_detected TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  analysis_result JSONB,
  negative_items_extracted JSONB,
  positive_accounts_extracted JSONB,
  profile_summary TEXT,
  estimated_score_impact INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_report_uploads ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage all report uploads"
ON public.credit_report_uploads
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coaches can view/create for their clients
CREATE POLICY "Coaches can view client report uploads"
ON public.credit_report_uploads
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = credit_report_uploads.user_id
    AND cc.status = 'active'
  )
);

CREATE POLICY "Coaches can create client report uploads"
ON public.credit_report_uploads
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = credit_report_uploads.user_id
    AND cc.status = 'active'
  )
);

-- Users can view their own
CREATE POLICY "Users can view own report uploads"
ON public.credit_report_uploads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_credit_report_uploads_updated_at
BEFORE UPDATE ON public.credit_report_uploads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for credit report PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('credit-report-uploads', 'credit-report-uploads', false);

-- Storage policies
CREATE POLICY "Admins can upload credit reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Coaches can upload credit reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins can view all credit reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Coaches can view credit reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Users can view own credit reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
