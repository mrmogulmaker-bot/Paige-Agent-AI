
-- Ship #2 — Scheduled Credit + Funding Readiness Proposals (v3)

ALTER TABLE public.tenant_features
  ADD COLUMN IF NOT EXISTS readiness_scan_cadence text NOT NULL DEFAULT 'monthly'
    CHECK (readiness_scan_cadence IN ('monthly','quarterly'));

CREATE TABLE IF NOT EXISTS public.paige_readiness_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  cadence text NOT NULL DEFAULT 'monthly',
  trigger_source text NOT NULL DEFAULT 'cron' CHECK (trigger_source IN ('cron','manual','backfill')),
  contacts_scanned int NOT NULL DEFAULT 0,
  proposals_generated int NOT NULL DEFAULT 0,
  proposals_insufficient_data int NOT NULL DEFAULT 0,
  isoftpull_calls int NOT NULL DEFAULT 0,
  cost_usd_total numeric(10,4) NOT NULL DEFAULT 0,
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_readiness_scan_runs TO authenticated;
GRANT ALL ON public.paige_readiness_scan_runs TO service_role;

ALTER TABLE public.paige_readiness_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admins_read_scan_runs"
  ON public.paige_readiness_scan_runs FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.is_tenant_owner(auth.uid(), tenant_id)
    )
  );

CREATE POLICY "service_role_all_scan_runs"
  ON public.paige_readiness_scan_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_readiness_scan_runs_tenant_started
  ON public.paige_readiness_scan_runs(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.paige_readiness_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scan_run_id uuid REFERENCES public.paige_readiness_scan_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','executed','insufficient_data')),
  readiness_delta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  envelope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  compose_intent text NOT NULL DEFAULT 'transactional'
    CHECK (compose_intent IN ('transactional','marketing','nurture','notification')),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejection_reason text,
  executed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '25 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.paige_readiness_proposals TO authenticated;
GRANT ALL ON public.paige_readiness_proposals TO service_role;

ALTER TABLE public.paige_readiness_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admins_manage_readiness_proposals"
  ON public.paige_readiness_proposals FOR ALL TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.is_tenant_owner(auth.uid(), tenant_id)
    )
  )
  WITH CHECK (
    tenant_id = public.current_user_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.is_tenant_owner(auth.uid(), tenant_id)
    )
  );

CREATE POLICY "coaches_read_assigned_readiness_proposals"
  ON public.paige_readiness_proposals FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = contact_id
        AND c.assigned_coach_user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_readiness_proposals"
  ON public.paige_readiness_proposals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_readiness_proposals_tenant_status
  ON public.paige_readiness_proposals(tenant_id, status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_readiness_proposals_contact
  ON public.paige_readiness_proposals(contact_id, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_readiness_proposals_scan_run
  ON public.paige_readiness_proposals(scan_run_id);

CREATE OR REPLACE FUNCTION public.set_readiness_proposal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_readiness_proposals_updated_at ON public.paige_readiness_proposals;
CREATE TRIGGER trg_readiness_proposals_updated_at
  BEFORE UPDATE ON public.paige_readiness_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_readiness_proposal_updated_at();

CREATE OR REPLACE FUNCTION public.expire_prior_pending_readiness_proposals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    UPDATE public.paige_readiness_proposals
       SET status = 'expired', updated_at = now()
     WHERE contact_id = NEW.contact_id
       AND id <> NEW.id
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_readiness_proposals_dedupe ON public.paige_readiness_proposals;
CREATE TRIGGER trg_readiness_proposals_dedupe
  AFTER INSERT ON public.paige_readiness_proposals
  FOR EACH ROW EXECUTE FUNCTION public.expire_prior_pending_readiness_proposals();

CREATE OR REPLACE FUNCTION public.expire_stale_readiness_proposals()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE expired_count int;
BEGIN
  UPDATE public.paige_readiness_proposals
     SET status = 'expired', updated_at = now()
   WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;

  INSERT INTO public.paige_audit_log (action, resource_type, metadata, created_at)
  VALUES (
    'readiness_proposal_ttl_sweep',
    'paige_readiness_proposals',
    jsonb_build_object('expired_count', expired_count, 'ran_at', now()),
    now()
  );
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_readiness_proposals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_readiness_proposals() TO service_role;
