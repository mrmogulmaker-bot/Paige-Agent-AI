
CREATE TABLE public.lender_research_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_user_id UUID,
  search_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_commentary TEXT,
  is_deep_research BOOLEAN NOT NULL DEFAULT false,
  search_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lender_research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all research results"
  ON public.lender_research_results FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coaches can manage own research results"
  ON public.lender_research_results FOR ALL
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "Users can view research saved to their profile"
  ON public.lender_research_results FOR SELECT
  USING (auth.uid() = client_user_id);

CREATE POLICY "Service role can manage all research"
  ON public.lender_research_results FOR ALL
  USING (current_setting('role'::text) = 'service_role'::text);

CREATE TRIGGER update_lender_research_results_updated_at
  BEFORE UPDATE ON public.lender_research_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
