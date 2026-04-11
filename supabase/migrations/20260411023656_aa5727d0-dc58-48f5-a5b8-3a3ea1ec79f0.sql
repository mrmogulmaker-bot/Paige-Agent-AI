
CREATE TABLE public.financial_document_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id),
  doc_type_detected TEXT,
  period_start DATE,
  period_end DATE,
  avg_monthly_revenue NUMERIC,
  avg_daily_balance NUMERIC,
  revenue_trend TEXT CHECK (revenue_trend IN ('increasing', 'decreasing', 'stable', 'volatile', 'insufficient_data')),
  nsf_count INTEGER DEFAULT 0,
  overdraft_count INTEGER DEFAULT 0,
  largest_deposit NUMERIC,
  largest_deposit_description TEXT,
  largest_withdrawal NUMERIC,
  largest_withdrawal_description TEXT,
  lender_red_flags JSONB DEFAULT '[]'::jsonb,
  full_analysis JSONB,
  lender_summary_path TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all financial analyses"
ON public.financial_document_analyses
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view client financial analyses"
ON public.financial_document_analyses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = financial_document_analyses.user_id
    AND cc.status = 'active'
  )
);

CREATE POLICY "Coaches can create client financial analyses"
ON public.financial_document_analyses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
    AND cc.client_user_id = financial_document_analyses.user_id
    AND cc.status = 'active'
  )
);

CREATE POLICY "Users can view own financial analyses"
ON public.financial_document_analyses
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_financial_document_analyses_updated_at
BEFORE UPDATE ON public.financial_document_analyses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
