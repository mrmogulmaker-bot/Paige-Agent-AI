
-- Create credit_report_personal_info table
CREATE TABLE public.credit_report_personal_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  credit_report_upload_id UUID REFERENCES public.credit_report_uploads(id) ON DELETE CASCADE NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('name', 'address', 'employer', 'phone', 'dob', 'ssn_variation')),
  field_value TEXT NOT NULL,
  bureau_source TEXT NOT NULL CHECK (bureau_source IN ('experian', 'transunion', 'equifax', 'all_three', 'unknown')),
  date_range TEXT,
  status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed', 'correct', 'outdated', 'not_mine', 'current', 'former')),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_report_personal_info ENABLE ROW LEVEL SECURITY;

-- Users can view their own records
CREATE POLICY "Users can view own personal info"
ON public.credit_report_personal_info FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all personal info"
ON public.credit_report_personal_info FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Coaches can view their assigned clients
CREATE POLICY "Coaches can view assigned client personal info"
ON public.credit_report_personal_info FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach') AND
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = credit_report_personal_info.user_id
    AND cc.status = 'active'
  )
);

-- Service role can insert (used by edge functions)
CREATE POLICY "Service role can insert personal info"
ON public.credit_report_personal_info FOR INSERT
TO service_role
WITH CHECK (true);

-- Users can update status on their own records
CREATE POLICY "Users can update own personal info status"
ON public.credit_report_personal_info FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can update any record
CREATE POLICY "Admins can update all personal info"
ON public.credit_report_personal_info FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Coaches can update assigned client records
CREATE POLICY "Coaches can update assigned client personal info"
ON public.credit_report_personal_info FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach') AND
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = credit_report_personal_info.user_id
    AND cc.status = 'active'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_credit_report_personal_info_updated_at
BEFORE UPDATE ON public.credit_report_personal_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_credit_report_personal_info_user_id ON public.credit_report_personal_info(user_id);
CREATE INDEX idx_credit_report_personal_info_upload_id ON public.credit_report_personal_info(credit_report_upload_id);
