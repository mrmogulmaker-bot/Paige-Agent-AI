
CREATE TABLE public.paige_ingestion_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_user_id uuid,
  actor_role text NOT NULL DEFAULT 'mcp:platform',
  actor_label text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  target_table text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','expired','needs_review','applied')),
  confidence text CHECK (confidence IN ('high','medium','low')),
  source text NOT NULL DEFAULT 'mcp',
  external_llm_model text,
  review_reason text,
  applied_row_ids jsonb,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes')
);

CREATE INDEX idx_paige_ingestion_proposals_tenant_status ON public.paige_ingestion_proposals (tenant_id, status, created_at DESC);
CREATE INDEX idx_paige_ingestion_proposals_client ON public.paige_ingestion_proposals (client_id, created_at DESC);
CREATE INDEX idx_paige_ingestion_proposals_actor ON public.paige_ingestion_proposals (actor_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_ingestion_proposals TO authenticated;
GRANT ALL ON public.paige_ingestion_proposals TO service_role;

ALTER TABLE public.paige_ingestion_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ingestion proposals"
  ON public.paige_ingestion_proposals
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Actors see their own proposals"
  ON public.paige_ingestion_proposals
  FOR SELECT
  TO authenticated
  USING (actor_user_id = auth.uid());
