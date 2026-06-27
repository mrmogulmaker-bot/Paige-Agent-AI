
-- =========================================================
-- 1. paige_conversations
-- =========================================================
CREATE TABLE public.paige_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email','sms','chat')),
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  subject text,
  body text NOT NULL,
  source_message_id text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','replied','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_conversations TO authenticated;
GRANT ALL ON public.paige_conversations TO service_role;
ALTER TABLE public.paige_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches manage conversations"
  ON public.paige_conversations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE INDEX idx_paige_conversations_contact ON public.paige_conversations (contact_id, created_at DESC);
CREATE INDEX idx_paige_conversations_new ON public.paige_conversations (created_at DESC) WHERE status = 'new';
CREATE UNIQUE INDEX idx_paige_conversations_source_unique ON public.paige_conversations (channel, source_message_id) WHERE source_message_id IS NOT NULL;

CREATE TRIGGER trg_paige_conversations_updated_at
  BEFORE UPDATE ON public.paige_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_conversations;
ALTER TABLE public.paige_conversations REPLICA IDENTITY FULL;

-- =========================================================
-- 2. paige_messages_audit
-- =========================================================
CREATE TABLE public.paige_messages_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  pipe_used text NOT NULL CHECK (pipe_used IN ('resend','twilio','ghl_fallback')),
  to_address text NOT NULL,
  from_address text,
  subject text,
  body text,
  status text NOT NULL CHECK (status IN ('queued','sent','failed','bounced')),
  vendor_message_id text,
  error text,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.paige_conversations(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paige_messages_audit TO authenticated;
GRANT ALL ON public.paige_messages_audit TO service_role;
ALTER TABLE public.paige_messages_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches view audit"
  ON public.paige_messages_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE INDEX idx_paige_audit_conversation ON public.paige_messages_audit (conversation_id, sent_at DESC);
CREATE INDEX idx_paige_audit_contact ON public.paige_messages_audit (contact_id, sent_at DESC);
CREATE INDEX idx_paige_audit_failed ON public.paige_messages_audit (created_at DESC) WHERE status = 'failed';

CREATE TRIGGER trg_paige_audit_updated_at
  BEFORE UPDATE ON public.paige_messages_audit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. paige_config (singleton)
-- =========================================================
CREATE TABLE public.paige_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  twilio_a2p_status text NOT NULL DEFAULT 'pending' CHECK (twilio_a2p_status IN ('pending','approved','rejected')),
  resend_domain_verified boolean NOT NULL DEFAULT false,
  ghl_fallback_enabled boolean NOT NULL DEFAULT true,
  default_from_email text,
  default_from_sms_number text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paige_config TO authenticated;
GRANT ALL ON public.paige_config TO service_role;
ALTER TABLE public.paige_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read config"
  ON public.paige_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins update config"
  ON public.paige_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert config"
  ON public.paige_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_paige_config_updated_at
  BEFORE UPDATE ON public.paige_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.paige_config (id, default_from_email, default_from_sms_number)
VALUES (1, 'support@paigeagent.ai', NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- 4. paige_workflow_registry
-- =========================================================
CREATE TABLE public.paige_workflow_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('campaign','customer_support','admin','analytics')),
  n8n_workflow_id text,
  n8n_webhook_url text NOT NULL,
  parameters_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_workflow_registry TO authenticated;
GRANT ALL ON public.paige_workflow_registry TO service_role;
ALTER TABLE public.paige_workflow_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflow registry"
  ON public.paige_workflow_registry FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coaches read active workflows"
  ON public.paige_workflow_registry FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND is_active = true);

CREATE INDEX idx_paige_workflow_registry_cat ON public.paige_workflow_registry (category, is_active);

CREATE TRIGGER trg_paige_workflow_registry_updated_at
  BEFORE UPDATE ON public.paige_workflow_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5. paige_workflow_runs
-- =========================================================
CREATE TABLE public.paige_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id uuid NOT NULL REFERENCES public.paige_workflow_registry(id) ON DELETE CASCADE,
  triggered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  n8n_execution_id text,
  result jsonb,
  error text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.paige_workflow_runs TO authenticated;
GRANT ALL ON public.paige_workflow_runs TO service_role;
ALTER TABLE public.paige_workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all runs"
  ON public.paige_workflow_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coaches view own runs"
  ON public.paige_workflow_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND triggered_by_user_id = auth.uid());

CREATE POLICY "Admins and coaches insert runs"
  ON public.paige_workflow_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role))
    AND triggered_by_user_id = auth.uid()
  );

CREATE INDEX idx_paige_workflow_runs_registry ON public.paige_workflow_runs (registry_id, triggered_at DESC);
CREATE INDEX idx_paige_workflow_runs_user ON public.paige_workflow_runs (triggered_by_user_id, triggered_at DESC);

CREATE TRIGGER trg_paige_workflow_runs_updated_at
  BEFORE UPDATE ON public.paige_workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 6. paige_pending_approvals
-- =========================================================
CREATE TABLE public.paige_pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('cs_draft','campaign_send','tier_change','other')),
  draft_content jsonb NOT NULL,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.paige_conversations(id) ON DELETE SET NULL,
  created_by_n8n_workflow_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','edited','skipped','escalated')),
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  escalation_note text,
  sent_message_audit_id uuid REFERENCES public.paige_messages_audit(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.paige_pending_approvals TO authenticated;
GRANT ALL ON public.paige_pending_approvals TO service_role;
ALTER TABLE public.paige_pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and coaches manage approvals"
  ON public.paige_pending_approvals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'coach'::public.app_role));

CREATE INDEX idx_paige_approvals_pending ON public.paige_pending_approvals (created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_paige_approvals_type_status ON public.paige_pending_approvals (type, status);

CREATE TRIGGER trg_paige_approvals_updated_at
  BEFORE UPDATE ON public.paige_pending_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_pending_approvals;
ALTER TABLE public.paige_pending_approvals REPLICA IDENTITY FULL;
