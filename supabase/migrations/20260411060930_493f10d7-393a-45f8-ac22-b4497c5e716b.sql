
-- Create the clients table for internal client management
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  entity_name TEXT,
  entity_type TEXT,
  funding_goal NUMERIC,
  monthly_revenue NUMERIC,
  current_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  linked_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coaches can manage clients they created
CREATE POLICY "Coaches can manage own clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add client_id to existing tables (nullable, for backward compat)
ALTER TABLE public.credit_negative_items ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.credit_accounts ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.credit_factor_scores ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.credit_report_uploads ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.client_memory ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.funding_matches ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- Add indexes for client_id lookups
CREATE INDEX IF NOT EXISTS idx_credit_negative_items_client_id ON public.credit_negative_items(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_client_id ON public.credit_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_factor_scores_client_id ON public.credit_factor_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_report_uploads_client_id ON public.credit_report_uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_client_id ON public.disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_memory_client_id ON public.client_memory(client_id);
CREATE INDEX IF NOT EXISTS idx_funding_matches_client_id ON public.funding_matches(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON public.documents(client_id);

-- Add RLS policies so admins can read client-related data by client_id
-- (existing policies use user_id = auth.uid(); we need admin access via client_id too)
CREATE POLICY "Admins can view all credit_negative_items"
  ON public.credit_negative_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all credit_negative_items"
  ON public.credit_negative_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all credit_accounts"
  ON public.credit_accounts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all credit_accounts"
  ON public.credit_accounts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all disputes"
  ON public.disputes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all disputes"
  ON public.disputes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
