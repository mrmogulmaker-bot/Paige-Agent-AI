
-- ===== clients table: tighten over-broad role-based read policies =====
DROP POLICY IF EXISTS clients_cs_rep_pool_read ON public.clients;
CREATE POLICY clients_cs_rep_pool_read ON public.clients
  FOR SELECT
  USING (
    has_role(auth.uid(), 'cs_rep'::app_role)
    AND tier = ANY (ARRAY['standard','premium','vip','internal'])
    AND (
      cs_primary_user_id = auth.uid()
      OR is_assigned_to_client(auth.uid(), id, 'cs_primary')
    )
  );

DROP POLICY IF EXISTS clients_sales_rep_pool_read ON public.clients;
CREATE POLICY clients_sales_rep_pool_read ON public.clients
  FOR SELECT
  USING (
    has_role(auth.uid(), 'sales_rep'::app_role)
    AND tier = ANY (ARRAY['lead','standard'])
    AND (
      lead_owner_user_id = auth.uid()
      OR is_assigned_to_client(auth.uid(), id, 'lead_owner')
    )
  );

DROP POLICY IF EXISTS clients_finance_read ON public.clients;
CREATE POLICY clients_finance_read ON public.clients
  FOR SELECT
  USING (
    has_role(auth.uid(), 'finance'::app_role)
    AND tenant_id IS NOT NULL
    AND tenant_id = current_user_tenant_id()
  );

DROP POLICY IF EXISTS clients_viewer_read ON public.clients;
CREATE POLICY clients_viewer_read ON public.clients
  FOR SELECT
  USING (
    has_role(auth.uid(), 'viewer'::app_role)
    AND tenant_id IS NOT NULL
    AND tenant_id = current_user_tenant_id()
  );

-- ===== paige_bank_connections =====
DROP POLICY IF EXISTS admins_coaches_read_bank_connections ON public.paige_bank_connections;
CREATE POLICY admins_coaches_read_bank_connections ON public.paige_bank_connections
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND contact_id IS NOT NULL
      AND can_access_contact(auth.uid(), contact_id)
    )
  );

-- ===== paige_bank_transactions =====
DROP POLICY IF EXISTS admins_coaches_read_bank_tx ON public.paige_bank_transactions;
CREATE POLICY admins_coaches_read_bank_tx ON public.paige_bank_transactions
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.paige_bank_connections c
        WHERE c.id = paige_bank_transactions.bank_connection_id
          AND c.contact_id IS NOT NULL
          AND can_access_contact(auth.uid(), c.contact_id)
      )
    )
  );

-- ===== paige_business_credit_profiles =====
DROP POLICY IF EXISTS admins_coaches_read_business_credit ON public.paige_business_credit_profiles;
CREATE POLICY admins_coaches_read_business_credit ON public.paige_business_credit_profiles
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND contact_id IS NOT NULL
      AND can_access_contact(auth.uid(), contact_id)
    )
  );

-- ===== paige_cash_flow_snapshots =====
DROP POLICY IF EXISTS admins_coaches_read_cash_flow ON public.paige_cash_flow_snapshots;
CREATE POLICY admins_coaches_read_cash_flow ON public.paige_cash_flow_snapshots
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND contact_id IS NOT NULL
      AND can_access_contact(auth.uid(), contact_id)
    )
  );

-- ===== paige_owner_credit_snapshots =====
DROP POLICY IF EXISTS admins_coaches_read_owner_credit ON public.paige_owner_credit_snapshots;
CREATE POLICY admins_coaches_read_owner_credit ON public.paige_owner_credit_snapshots
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      has_role(auth.uid(), 'coach'::app_role)
      AND contact_id IS NOT NULL
      AND can_access_contact(auth.uid(), contact_id)
    )
  );

-- ===== audit_logs: prevent forging =====
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users insert their own audit logs" ON public.audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ===== outbound_webhook_configs: explicit grants =====
REVOKE ALL ON public.outbound_webhook_configs FROM anon;
REVOKE ALL ON public.outbound_webhook_configs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_webhook_configs TO authenticated;
GRANT ALL ON public.outbound_webhook_configs TO service_role;

-- ===== paige_workflow_registry: hide n8n_webhook_url from non-admins =====
DROP POLICY IF EXISTS "Workflow registry read scoped" ON public.paige_workflow_registry;
DROP POLICY IF EXISTS "Coaches read active workflows" ON public.paige_workflow_registry;

REVOKE SELECT ON public.paige_workflow_registry FROM authenticated;
GRANT SELECT (
  id, key, label, description, category, n8n_workflow_id,
  parameters_schema, requires_approval, is_active,
  connection_id, provider, langgraph_graph_id, direct_function_name,
  needs_n8n_link, sort_order, allowed_roles, created_at, updated_at
) ON public.paige_workflow_registry TO authenticated;

CREATE POLICY "Workflow registry read scoped (no url)" ON public.paige_workflow_registry
  FOR SELECT
  USING (
    has_any_role(auth.uid(), ARRAY['admin','super_admin'])
    OR (allowed_roles && current_user_roles())
  );

-- ===== SECURITY DEFINER function hardening =====
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.proname <> 'peek_tenant_invite'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC',
                   r.proname, r.args);
  END LOOP;
END $$;

DO $$
DECLARE
  fn_names text[] := ARRAY[
    'apply_assignment_policy','auto_advance_journey_on_tier','auto_assign_on_mirror',
    'auto_enroll_affiliate','btf_set_updated_at','create_default_business_limit',
    'create_default_comm_preferences','create_free_trial','ensure_owner_admin',
    'handle_new_user','handle_new_user_referral','hash_invitation_token',
    'log_credit_verification_pii_access','move_to_dlq','notify_credit_alert_inserted',
    'notify_new_user_onboarding','prevent_owner_admin_removal','set_ticket_resolved_at',
    'set_updated_at_tiers','stamp_tenant_id','sync_assigned_coach_to_coach_clients',
    'sync_assignment_to_client_denorm','sync_feature_request_vote_count',
    'sync_user_business_limit_from_subscription','tenant_set_updated_at',
    'trg_clients_apollo_enrich','update_disclosure_updated_at','update_funding_updated_at',
    'update_updated_at_column','factory_reset_delete_dispute_related',
    'rag_recalibrate_quality','reassign_coach_clients','reactivate_user','suspend_user',
    'admin_set_meta_capi_token','attribute_conversion','enqueue_email','delete_email'
  ];
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.proname = ANY(fn_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, PUBLIC',
                   r.proname, r.args);
  END LOOP;
END $$;
