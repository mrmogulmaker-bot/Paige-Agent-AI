
-- Table for outreach drafts
CREATE TABLE public.outreach_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID NOT NULL,
  outreach_type TEXT NOT NULL CHECK (outreach_type IN ('lender_introduction', 'application_cover', 'lender_followup', 'client_progress_update')),
  lender_name TEXT,
  funding_product TEXT,
  generated_content TEXT NOT NULL,
  edited_content TEXT,
  compliance_status TEXT NOT NULL DEFAULT 'pending' CHECK (compliance_status IN ('passed', 'flagged', 'pending')),
  compliance_flag_count INTEGER NOT NULL DEFAULT 0,
  compliance_flags JSONB,
  admin_edited BOOLEAN NOT NULL DEFAULT false,
  downloaded_at TIMESTAMPTZ,
  metadata JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_drafts ENABLE ROW LEVEL SECURITY;

-- Admins and coaches full access
CREATE POLICY "Admins can manage all outreach drafts"
ON public.outreach_drafts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can manage outreach drafts"
ON public.outreach_drafts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'coach'))
WITH CHECK (public.has_role(auth.uid(), 'coach'));

-- Clients read-only access to own drafts
CREATE POLICY "Users can view their own outreach drafts"
ON public.outreach_drafts
FOR SELECT
TO authenticated
USING (auth.uid() = client_user_id);

-- Timestamp trigger
CREATE TRIGGER update_outreach_drafts_updated_at
BEFORE UPDATE ON public.outreach_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_outreach_drafts_client ON public.outreach_drafts (client_user_id);
CREATE INDEX idx_outreach_drafts_created ON public.outreach_drafts (created_at DESC);
