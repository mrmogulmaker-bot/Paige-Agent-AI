
-- Ship #2.8: Dynamic Data Wiring Audit + Real-Time Sync Layer
-- §199 ecosystem ownership registry; §200 platform-agnostic; Ship #3.5 CSP-ready

CREATE TABLE IF NOT EXISTS public.paige_data_source_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  surface TEXT NOT NULL,                      -- e.g. 'ContactDetail.Overview', 'PipelineBoard'
  field_key TEXT NOT NULL,                    -- e.g. 'contacts.email', 'businesses.credit_score'
  table_name TEXT,                            -- underlying public.<table> if applicable
  column_name TEXT,
  ecosystem_owner TEXT NOT NULL,              -- 'paige' | 'external_crm' | 'external_community' | 'external_billing' | 'external_credit' | 'external_calendar' | 'derived'
  external_source_label TEXT,                 -- display label, e.g. 'GHL', 'Skool', 'Stripe', 'iSoftpull'
  sync_mechanism TEXT NOT NULL,               -- 'native' | 'zapier_bridge' | 'n8n_webhook' | 'stripe_webhook' | 'manual' | 'derived'
  realtime_enabled BOOLEAN NOT NULL DEFAULT false,
  staleness_ttl_seconds INTEGER,              -- null = never stale (native paige-owned)
  paige_context_eligible BOOLEAN NOT NULL DEFAULT false,  -- Ship #3.5 CSP context loader flag
  pii_sensitive BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (surface, field_key)
);

GRANT SELECT ON public.paige_data_source_registry TO authenticated;
GRANT ALL ON public.paige_data_source_registry TO service_role;

ALTER TABLE public.paige_data_source_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "registry_read_authenticated"
  ON public.paige_data_source_registry FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "registry_write_platform_owner"
  ON public.paige_data_source_registry FOR ALL
  TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

CREATE TRIGGER paige_data_source_registry_updated_at
  BEFORE UPDATE ON public.paige_data_source_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Staleness snapshot table: last successful sync per (tenant, source_key)
CREATE TABLE IF NOT EXISTS public.paige_data_source_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,                   -- matches registry.external_source_label, e.g. 'stripe', 'ghl'
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_status TEXT NOT NULL DEFAULT 'ok',
  last_sync_error TEXT,
  record_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_key)
);

GRANT SELECT ON public.paige_data_source_sync_state TO authenticated;
GRANT ALL ON public.paige_data_source_sync_state TO service_role;

ALTER TABLE public.paige_data_source_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_state_tenant_read"
  ON public.paige_data_source_sync_state FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id = public.current_user_tenant_id()
  );

CREATE POLICY "sync_state_service_write"
  ON public.paige_data_source_sync_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER paige_data_source_sync_state_updated_at
  BEFORE UPDATE ON public.paige_data_source_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed registry with canonical surfaces (§199 ecosystem ownership documented)
INSERT INTO public.paige_data_source_registry
  (surface, field_key, table_name, column_name, ecosystem_owner, external_source_label, sync_mechanism, realtime_enabled, staleness_ttl_seconds, paige_context_eligible, pii_sensitive, notes)
VALUES
  ('ContactDetail.Overview','contacts.email','contacts','email','paige',NULL,'native',true,NULL,true,true,'Native Paige-owned CRM record'),
  ('ContactDetail.Overview','contacts.phone','contacts','phone','paige',NULL,'native',true,NULL,true,true,'Native Paige-owned CRM record'),
  ('ContactDetail.Overview','contacts.lifecycle_stage','contacts','lifecycle_stage','paige',NULL,'native',true,NULL,true,false,'§120 canonical enum'),
  ('ContactDetail.Billing','tenant_service_subscriptions.status','tenant_service_subscriptions','status','paige','Stripe','stripe_webhook',true,3600,true,false,'Ship #2.7; stripe id encrypted §190'),
  ('ContactDetail.Comms','outreach_drafts.body','outreach_drafts','body','paige',NULL,'native',true,NULL,true,false,'Email composer subagent output'),
  ('ContactDetail.Automation','stage_automation_events.status','stage_automation_events','status','paige',NULL,'native',true,NULL,false,false,'Ship #1 Phase B history'),
  ('ContactDetail.Credit','credit_report_uploads.score_snapshot','credit_report_uploads','score_snapshot','external_credit','Credit Data Provider','manual',false,86400,true,true,'§194 monitoring only; provider-agnostic per §193'),
  ('PipelineBoard.Card','deals.stage','deals','stage','paige',NULL,'native',true,NULL,true,false,'Realtime respects RLS'),
  ('PipelineBoard.Card','deals.amount','deals','amount','paige',NULL,'native',true,NULL,true,false,''),
  ('CalendarAdmin.Events','staff_calendar_settings.*','staff_calendar_settings',NULL,'external_calendar','Calendar Provider','n8n_webhook',false,900,false,false,'§193 vendor-neutral'),
  ('KnowledgeBase.Docs','tenant_knowledge_docs.content','tenant_knowledge_docs','content','paige',NULL,'native',true,NULL,true,false,'Per-tenant KB; §199 tenant-isolated'),
  ('AdminBridgeBell.Notifications','paige_admin_notifications.body','paige_admin_notifications','body','paige',NULL,'native',true,NULL,false,false,'Realtime channel'),
  ('BankingRelationships.Balance','balance_snapshots.balance_cents','balance_snapshots','balance_cents','external_billing','Bank Feed','n8n_webhook',false,3600,true,true,'Cached; display staleness'),
  ('CommunityRoster.Tier','contacts.tags','contacts','tags','external_community','Community Platform','zapier_bridge',false,7200,false,false,'§199 community-owned; bridged via automation'),
  ('CRMSync.Notes','client_notes.body','client_notes','body','paige',NULL,'native',true,NULL,true,false,'')
ON CONFLICT (surface, field_key) DO NOTHING;

-- Ensure realtime replication for the key surfaces (idempotent)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_data_source_sync_state; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.paige_admin_notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_automation_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_service_subscriptions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Helper RPC: fetch registry entries for a surface (Ship #3.5 CSP context loader)
CREATE OR REPLACE FUNCTION public.get_paige_context_fields(_surface TEXT DEFAULT NULL)
RETURNS SETOF public.paige_data_source_registry
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.paige_data_source_registry
  WHERE paige_context_eligible = true
    AND (_surface IS NULL OR surface = _surface);
$$;

REVOKE ALL ON FUNCTION public.get_paige_context_fields(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_paige_context_fields(TEXT) TO authenticated, service_role;
