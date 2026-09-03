BEGIN;
-- Generated via `supabase migration new payment_setup_atomic_reconciliation`
-- (20260903224650); sequenced after the repository's existing future-dated ledger.
-- Only a verified setup webhook may call this service-role transaction. No charge,
-- subscription, plan, contact selection, or provider-default mutation occurs here.
CREATE TABLE IF NOT EXISTS public.platform_payment_setup_completions (
  stripe_account text NOT NULL CHECK (stripe_account IN ('legacy', 'v2')),
  session_id text NOT NULL,
  event_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  actor_user_id uuid NOT NULL,
  setup_attempt text NOT NULL,
  livemode boolean NOT NULL,
  confirmed_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stripe_account, session_id),
  UNIQUE (stripe_account, event_id),
  UNIQUE (tenant_id, setup_attempt)
);
ALTER TABLE public.platform_payment_setup_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payment_setup_completions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payment_setup_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_payment_setup_completions TO service_role;
COMMENT ON TABLE public.platform_payment_setup_completions IS
  'Server-only atomic Billing setup receipts. Provider identifiers never form tenant, Spine, Rail or Mind evidence.';

CREATE OR REPLACE FUNCTION public.complete_platform_payment_setup(
  p_tenant_id uuid, p_actor_user_id uuid, p_setup_attempt text,
  p_stripe_account text, p_customer_id text, p_payment_method_id text,
  p_session_id text, p_event_id text, p_livemode boolean, p_confirmed_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  _mapping public.platform_billing_accounts%ROWTYPE;
  _completion public.platform_payment_setup_completions%ROWTYPE;
  _ids text[];
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_livemode IS NULL
     OR p_stripe_account NOT IN ('legacy', 'v2') OR p_stripe_account IS NULL
     OR NULLIF(p_customer_id, '') IS NULL OR NULLIF(p_payment_method_id, '') IS NULL
     OR NULLIF(p_session_id, '') IS NULL OR NULLIF(p_event_id, '') IS NULL
     OR p_setup_attempt IS NULL OR length(p_setup_attempt) NOT BETWEEN 8 AND 128
     OR p_confirmed_at IS NULL THEN RETURN 'binding_refused'; END IF;

  -- Lock order is identical for every setup completion. Unique constraints also
  -- protect against existing canonical mapping writers outside this RPC.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing_setup_tenant:' || p_tenant_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing_setup_customer:' || p_stripe_account || ':' || p_customer_id, 0));

  SELECT * INTO _completion FROM public.platform_payment_setup_completions
   WHERE (stripe_account = p_stripe_account AND (session_id = p_session_id OR event_id = p_event_id))
      OR (tenant_id = p_tenant_id AND setup_attempt = p_setup_attempt) LIMIT 1;
  IF FOUND THEN
    IF _completion.tenant_id = p_tenant_id AND _completion.actor_user_id = p_actor_user_id
       AND _completion.stripe_account = p_stripe_account AND _completion.session_id = p_session_id
       AND _completion.setup_attempt = p_setup_attempt AND _completion.livemode = p_livemode THEN
      RETURN 'duplicate';
    END IF;
    RETURN 'binding_refused';
  END IF;

  -- The authorization proof was persisted before the provider side effect. The
  -- actor need not still have this workspace selected when a delayed event arrives.
  IF NOT EXISTS (SELECT 1 FROM public.paige_audit_log a
    WHERE a.tenant_id = p_tenant_id AND a.actor_user_id = p_actor_user_id
      AND a.action = 'platform_billing_connect_requested'
      AND a.payload->>'setup_attempt' = p_setup_attempt)
    OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id
      AND t.parent_tenant_id IS NULL AND t.account_type NOT IN ('agency', 'enterprise', 'sub_account'))
  THEN RETURN 'binding_refused'; END IF;

  _ids := public.platform_billing_layer1_customer_ids(p_tenant_id);
  IF EXISTS (SELECT 1 FROM unnest(_ids) AS x(customer_id) WHERE x.customer_id <> p_customer_id)
  THEN RETURN 'binding_refused'; END IF;
  SELECT * INTO _mapping FROM public.platform_billing_accounts WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF FOUND AND (_mapping.stripe_customer_id <> p_customer_id OR _mapping.stripe_account <> p_stripe_account)
  THEN RETURN 'binding_refused'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_billing_accounts WHERE stripe_account = p_stripe_account
    AND stripe_customer_id = p_customer_id AND tenant_id <> p_tenant_id)
  THEN RETURN 'binding_refused'; END IF;

  INSERT INTO public.platform_billing_accounts(tenant_id, stripe_customer_id, stripe_account, source, created_by)
    VALUES (p_tenant_id, p_customer_id, p_stripe_account, 'checkout', p_actor_user_id)
    ON CONFLICT (tenant_id) DO NOTHING;
  -- Recheck after INSERT: another canonical writer may have won its unique race.
  SELECT * INTO _mapping FROM public.platform_billing_accounts WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF _mapping.stripe_customer_id <> p_customer_id OR _mapping.stripe_account <> p_stripe_account
  THEN RAISE EXCEPTION 'setup_binding_refused' USING ERRCODE = '23514'; END IF;

  -- A delayed older session must not replace a more recently confirmed method.
  UPDATE public.platform_billing_accounts SET
    payment_method_id = p_payment_method_id,
    payment_method_brand = NULL, payment_method_last4 = NULL,
    payment_method_exp_month = NULL, payment_method_exp_year = NULL,
    payment_method_connected_at = COALESCE(payment_method_connected_at, p_confirmed_at),
    payment_method_updated_at = p_confirmed_at
  WHERE tenant_id = p_tenant_id
    AND (payment_method_updated_at IS NULL OR payment_method_updated_at <= p_confirmed_at);

  -- This INSERT is permanent completion ONLY if every write above commits.
  INSERT INTO public.platform_payment_setup_completions
    (stripe_account, session_id, event_id, tenant_id, actor_user_id, setup_attempt, livemode, confirmed_at)
  VALUES (p_stripe_account, p_session_id, p_event_id, p_tenant_id, p_actor_user_id, p_setup_attempt, p_livemode, p_confirmed_at);
  RETURN 'completed';
EXCEPTION
  WHEN unique_violation OR check_violation THEN RETURN 'binding_refused';
  WHEN OTHERS THEN
    -- PL/pgSQL exception subtransaction rolls back ALL writes above. Never return
    -- raw errors, provider values, or a false completed receipt on database failure.
    RETURN 'persistence_retryable';
END;
$$;
REVOKE ALL ON FUNCTION public.complete_platform_payment_setup(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_platform_payment_setup(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz) TO service_role;
COMMENT ON FUNCTION public.complete_platform_payment_setup(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz) IS
  'Service-only atomic setup reconciliation. Required mapping and payment confirmation precede completion; all writes roll back on failure. Does not select an invoice default or charge.';

-- The invoker RPC needs the existing canonical ambiguity helper; no tenant grant.
GRANT EXECUTE ON FUNCTION public.platform_billing_layer1_customer_ids(uuid) TO service_role;

-- A committed duplicate needs no live provider availability. This private boolean
-- read binds every receipt coordinate without returning any provider identifiers.
CREATE OR REPLACE FUNCTION public.platform_payment_setup_is_complete(
  p_tenant_id uuid, p_actor_user_id uuid, p_setup_attempt text,
  p_stripe_account text, p_session_id text, p_livemode boolean
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.platform_payment_setup_completions
  WHERE tenant_id = p_tenant_id AND actor_user_id = p_actor_user_id
    AND setup_attempt = p_setup_attempt AND stripe_account = p_stripe_account
    AND session_id = p_session_id AND livemode = p_livemode);
$$;
REVOKE ALL ON FUNCTION public.platform_payment_setup_is_complete(uuid,uuid,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_payment_setup_is_complete(uuid,uuid,text,text,text,boolean) TO service_role;
COMMIT;
