-- Contract A only: opaque, presentation-safe Systems Check signal references.
--
-- This is a read boundary over the existing Systems Check source. It does not expose
-- systems_check_snapshot, mutate findings, file actions, enforce Trust Compass, or
-- create outcomes. The URL account number is an address only; the active tenant and
-- actor are resolved and authorized again inside both SECURITY DEFINER functions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.paige_systems_check_signal_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_digest text NOT NULL UNIQUE
    CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  finding_id uuid NOT NULL
    REFERENCES public.paige_systems_check_finding(id) ON DELETE CASCADE,
  issued_to uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS paige_systems_check_signal_reference_actor_idx
  ON public.paige_systems_check_signal_reference (issued_to, finding_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS paige_systems_check_signal_reference_expiry_idx
  ON public.paige_systems_check_signal_reference (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.paige_systems_check_signal_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_systems_check_signal_reference FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_systems_check_signal_reference
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_systems_check_signal_reference(
  p_account_number bigint,
  p_signal_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _tenant_id uuid;
  _authorized boolean := false;
  _signal record;
  _finding_count integer;
  _unavailable_count integer;
  _coverage text;
  _safe_source text;
  _safe_category text;
  _signal_kind text;
  _signal_label text;
  _next_state text;
BEGIN
  IF _actor_id IS NULL
     OR p_account_number IS NULL
     OR p_signal_ref IS NULL
     OR p_signal_ref !~ '^scsig_v1_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  -- Deliberately read the explicit active account. current_user_tenant_id() alone is
  -- insufficient because it falls back to the caller's first membership.
  SELECT p.active_tenant_id
    INTO _tenant_id
    FROM public.profiles p
   WHERE p.user_id = _actor_id;

  IF _tenant_id IS NULL
     OR public.current_user_tenant_id() IS DISTINCT FROM _tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  -- tenants.account_number is introduced later in the committed migration history.
  -- Dynamic SQL keeps this migration replayable in timestamp order while still making
  -- the deployed function compare the route address against the server-resolved tenant.
  BEGIN
    EXECUTE $account_gate$
      SELECT EXISTS (
        SELECT 1
          FROM public.tenants t
          JOIN public.tenant_members tm
            ON tm.tenant_id = t.id
           AND tm.user_id = $3
         WHERE t.id = $1
           AND t.account_number = $2
           AND t.status::text IN ('trial', 'active', 'past_due')
           AND tm.status = 'active'
           AND (tm.is_owner OR tm.role::text IN ('owner', 'admin', 'coach'))
      )
    $account_gate$
      INTO _authorized
      USING _tenant_id, p_account_number, _actor_id;
  EXCEPTION
    WHEN undefined_column THEN
      _authorized := false;
  END;

  IF NOT COALESCE(_authorized, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  SELECT
    f.status,
    f.check_id,
    reg.domain,
    reg.data_source,
    r.id AS run_id,
    r.check_count
    INTO _signal
    FROM public.paige_systems_check_finding f
    JOIN public.paige_systems_check_signal_reference ref
      ON ref.finding_id = f.id
     AND ref.issued_to = _actor_id
     AND ref.revoked_at IS NULL
     AND ref.expires_at > now()
     AND ref.token_digest = encode(
       extensions.digest(convert_to(p_signal_ref, 'UTF8'), 'sha256'),
       'hex'
     )
    JOIN public.paige_systems_check_run r
      ON r.id = f.run_id
     AND r.tenant_id = f.tenant_id
    JOIN public.paige_systems_check_registry reg
      ON reg.check_id = f.check_id
   WHERE f.tenant_id = _tenant_id
     AND reg.scope = 'tenant'
     AND reg.mvp_locked = true
     AND reg.vertical_playbook_id IS NULL
     AND f.status IN ('pass', 'fail')
     AND f.resolved_at IS NULL
     AND f.resolution IS NULL
     AND r.completed_at IS NOT NULL
     AND r.started_at <= r.completed_at
     AND r.completed_at <= now()
     AND r.completed_at >= now() - interval '24 hours'
     AND r.id = (
       SELECT latest.id
         FROM public.paige_systems_check_run latest
        WHERE latest.tenant_id = _tenant_id
        ORDER BY latest.started_at DESC, latest.created_at DESC, latest.id DESC
        LIMIT 1
     )
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE f.status IN ('skip', 'error'))::integer
    INTO _finding_count, _unavailable_count
    FROM public.paige_systems_check_finding f
   WHERE f.run_id = _signal.run_id
     AND f.tenant_id = _tenant_id;

  _coverage := CASE
    WHEN _signal.check_count > 0
     AND _finding_count = _signal.check_count
     AND _unavailable_count = 0
      THEN 'complete'
    ELSE 'partial'
  END;

  _safe_source := CASE _signal.data_source
    WHEN 'native_seam' THEN 'tenant_records'
    WHEN 'self_hosted_worker' THEN 'managed_worker'
    WHEN 'external_vendor' THEN 'connected_source'
    WHEN 'fetch_url' THEN 'connected_source'
    WHEN 'api_call' THEN 'connected_source'
    ELSE 'unavailable'
  END;

  _safe_category := CASE _signal.domain
    WHEN 'infrastructure' THEN 'infrastructure'
    WHEN 'marketing' THEN 'marketing'
    WHEN 'forms_booking' THEN 'forms_booking'
    WHEN 'comms_deliverability' THEN 'comms_deliverability'
    WHEN 'payments_ops' THEN 'payments_ops'
    WHEN 'data_product' THEN 'data_product'
    WHEN 'vertical_custom' THEN 'custom'
    ELSE 'unavailable'
  END;

  SELECT mapped.signal_kind, mapped.signal_label
    INTO _signal_kind, _signal_label
    FROM (VALUES
      ('comms_configured', 'communications_readiness', 'Communications readiness'),
      ('website_connected', 'website_presence', 'Website presence'),
      ('social_accounts_connected', 'social_presence_record', 'Social presence record'),
      ('automation_wired', 'automation_readiness', 'Automation readiness'),
      ('company_info_populated', 'business_profile', 'Business profile'),
      ('crm_has_customers', 'customer_records', 'Customer records'),
      ('sales_pipeline_configured', 'sales_pipeline', 'Sales pipeline'),
      ('revenue_tracking_configured', 'revenue_tracking', 'Revenue tracking'),
      ('payment_processor_connected', 'payment_readiness', 'Payment readiness'),
      ('payment_method_options', 'payment_options', 'Payment options')
    ) AS mapped(check_id, signal_kind, signal_label)
   WHERE mapped.check_id = _signal.check_id;

  IF _safe_source = 'unavailable'
     OR _safe_category = 'unavailable'
     OR _signal_kind IS NULL
     OR _signal_label IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  _next_state := CASE _signal.status
    WHEN 'fail' THEN 'owner_review'
    WHEN 'pass' THEN 'monitor'
    ELSE 'unavailable'
  END;

  RETURN jsonb_build_object(
    'signal_ref', p_signal_ref,
    'status', _signal.status,
    'signal_kind', _signal_kind,
    'signal_label', _signal_label,
    'category', _safe_category,
    'source', _safe_source,
    'freshness', 'current',
    'coverage', _coverage,
    'next_state', _next_state
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_systems_check_signal_reference(
  p_account_number bigint,
  p_finding_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _signal_ref text;
BEGIN
  IF _actor_id IS NULL OR p_account_number IS NULL OR p_finding_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_SIGNAL_UNAVAILABLE';
  END IF;

  -- Serialize replacement for one actor/source pair so concurrent issuance leaves
  -- exactly one active handle and never exposes a plaintext token in storage.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_finding_id::text || ':' || _actor_id::text, 0)
  );

  UPDATE public.paige_systems_check_signal_reference ref
     SET revoked_at = now()
   WHERE ref.finding_id = p_finding_id
     AND ref.issued_to = _actor_id
     AND ref.revoked_at IS NULL;

  _signal_ref := 'scsig_v1_' || encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.paige_systems_check_signal_reference
    (token_digest, finding_id, issued_to, expires_at)
  VALUES
    (
      encode(extensions.digest(convert_to(_signal_ref, 'UTF8'), 'sha256'), 'hex'),
      p_finding_id,
      _actor_id,
      now() + interval '15 minutes'
    );

  -- Resolution performs the complete account, actor, tenant, freshness, lifecycle,
  -- and presentation-safety gate before a reference is issued.
  PERFORM public.resolve_systems_check_signal_reference(p_account_number, _signal_ref);
  RETURN _signal_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_systems_check_signal_reference(bigint, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.resolve_systems_check_signal_reference(bigint, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.issue_systems_check_signal_reference(bigint, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_systems_check_signal_reference(bigint, text)
  TO authenticated;

COMMENT ON TABLE public.paige_systems_check_signal_reference IS
  'Contract A ephemeral reference registry. Stores only a token digest, source finding link, actor, and lifecycle timestamps; no evidence, tenant duplicate, prompt, action, authority, or outcome data. No client role has table access.';
COMMENT ON FUNCTION public.issue_systems_check_signal_reference(bigint, uuid) IS
  'Contract A issuer. Mints a 15-minute random actor-bound handle, stores only its digest, and returns it only after server-side active-account, tenant-role, current-run, freshness, unresolved-state, and safe-source validation. Writes reference lifecycle only; never mutates source truth or files an action/outcome.';
COMMENT ON FUNCTION public.resolve_systems_check_signal_reference(bigint, text) IS
  'Contract A resolver. Returns only a fixed presentation-safe structural allowlist. Never returns raw Systems Check evidence, prompts, interpretations, drafted fixes, errors, internal IDs, or model metadata; performs no write.';

COMMIT;
