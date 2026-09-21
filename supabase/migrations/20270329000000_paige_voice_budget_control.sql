-- PAIGE Voice V1a budget control (INT-104 / INT-089 / INT-100).
--
-- This migration is additive. It does not enable voice transport and it supplies no
-- non-zero budget. Platform and tenant budgets both default to zero/disabled; the
-- emergency stop defaults ON. The owner-proposed dollar values are intentionally not
-- encoded here: configuration is written only through the capability-gated functions.
--
-- Tenant authority: `voice.budget.configure_tenant` is resolved here for an active
-- owner/admin membership in that same tenant. A platform role has no tenant write.
-- Platform authority: `voice.budget.configure_platform` is resolved only for the
-- platform owner and the global cap is changed only by the platform function.
--
-- ROLLBACK (forward-only production procedure): first disable transport, set
-- emergency_disabled=true, and deploy paige-tts without the V1a reservation contract.
-- Then CREATE OR REPLACE reserve/settle with their 20260907155052 bodies. After proving
-- no caller uses the V1a columns/functions, drop the two setter functions, two capability
-- functions, the budget and monthly-usage tables, the budget-period index, and the provider/budget_month/
-- rate columns; finally restore the former reservation state check. Existing reservation
-- rows must be exported before dropping columns. Do not down-migrate a live deployment.

CREATE TABLE public.paige_voice_platform_budget (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  emergency_disabled boolean NOT NULL DEFAULT true,
  monthly_limit_usd numeric NOT NULL DEFAULT 0 CHECK (monthly_limit_usd >= 0),
  max_usd_per_1000_chars numeric NOT NULL DEFAULT 0 CHECK (max_usd_per_1000_chars >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.paige_voice_tenant_budgets (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  monthly_limit_usd numeric NOT NULL DEFAULT 0 CHECK (monthly_limit_usd >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.paige_voice_platform_budget(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.paige_voice_platform_monthly_usage (
  budget_month date PRIMARY KEY,
  reserved_usd numeric NOT NULL CHECK (reserved_usd >= 0)
);

CREATE TABLE public.paige_voice_tenant_monthly_usage (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  budget_month date NOT NULL,
  reserved_usd numeric NOT NULL CHECK (reserved_usd >= 0),
  PRIMARY KEY (tenant_id, budget_month)
);

ALTER TABLE public.paige_voice_platform_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_tenant_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_platform_monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_voice_tenant_monthly_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_voice_platform_budget, public.paige_voice_tenant_budgets,
  public.paige_voice_platform_monthly_usage, public.paige_voice_tenant_monthly_usage
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.paige_voice_cost_reservations
  ADD COLUMN provider text,
  ADD COLUMN budget_month date,
  ADD COLUMN rate_usd_per_1000_chars numeric;

UPDATE public.paige_voice_cost_reservations
SET provider = 'elevenlabs',
    budget_month = date_trunc('month', created_at AT TIME ZONE 'UTC')::date,
    rate_usd_per_1000_chars = (reserved_usd * 1000) / character_count;

ALTER TABLE public.paige_voice_cost_reservations
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN budget_month SET NOT NULL,
  ALTER COLUMN rate_usd_per_1000_chars SET NOT NULL,
  ADD CONSTRAINT paige_voice_cost_provider_check CHECK (provider IN ('elevenlabs','openai')),
  ADD CONSTRAINT paige_voice_cost_rate_check CHECK (rate_usd_per_1000_chars > 0);

ALTER TABLE public.paige_voice_cost_reservations
  DROP CONSTRAINT paige_voice_cost_reservations_state_check;
ALTER TABLE public.paige_voice_cost_reservations
  ADD CONSTRAINT paige_voice_cost_reservations_state_check
  CHECK (state IN ('reserved','committed','released','ambiguous'));

CREATE INDEX idx_paige_voice_budget_period
  ON public.paige_voice_cost_reservations(budget_month, state, tenant_id);

CREATE OR REPLACE FUNCTION public._paige_voice_tenant_budget_capabilities(
  _tenant_id uuid,
  _actor_user_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caps text[] := ARRAY[]::text[];
BEGIN
  IF _actor_user_id IS NOT NULL
     AND _tenant_id IS NOT NULL
     AND public.is_tenant_admin_as(_actor_user_id, _tenant_id) THEN
    _caps := array_append(_caps, 'voice.budget.configure_tenant');
  END IF;
  RETURN _caps;
END;
$$;

CREATE OR REPLACE FUNCTION public._paige_voice_platform_budget_capabilities(
  _actor_user_id uuid
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caps text[] := ARRAY[]::text[];
BEGIN
  IF _actor_user_id IS NOT NULL AND public.is_platform_owner(_actor_user_id) THEN
    _caps := array_append(_caps, 'voice.budget.configure_platform');
  END IF;
  RETURN _caps;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_paige_voice_tenant_budget(
  _tenant_id uuid,
  _enabled boolean,
  _monthly_limit_usd numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _caps text[];
BEGIN
  IF _actor IS NULL OR _tenant_id IS NULL THEN
    RAISE EXCEPTION 'PAIGE_VOICE_TENANT_BUDGET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  _caps := public._paige_voice_tenant_budget_capabilities(_tenant_id, _actor);
  IF NOT ('voice.budget.configure_tenant' = ANY(_caps)) THEN
    RAISE EXCEPTION 'PAIGE_VOICE_TENANT_BUDGET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL OR _monthly_limit_usd IS NULL OR _monthly_limit_usd < 0
     OR (_enabled AND _monthly_limit_usd <= 0) THEN
    RAISE EXCEPTION 'PAIGE_VOICE_TENANT_BUDGET_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paige_voice_tenant_budgets(
    tenant_id, enabled, monthly_limit_usd, updated_by, updated_at
  ) VALUES (
    _tenant_id, _enabled, _monthly_limit_usd, _actor, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  INSERT INTO public.paige_audit_log(
    actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload
  ) VALUES (
    _actor, 'tenant_admin', 'voice.budget.tenant.configure',
    'paige_voice_tenant_budgets', _tenant_id, _tenant_id,
    jsonb_build_object('enabled', _enabled, 'monthly_limit_usd', _monthly_limit_usd)
  );

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'enabled', _enabled,
    'monthly_limit_usd', _monthly_limit_usd,
    'updated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_paige_voice_platform_budget(
  _enabled boolean,
  _emergency_disabled boolean,
  _monthly_limit_usd numeric,
  _max_usd_per_1000_chars numeric
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _caps text[];
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'PAIGE_VOICE_PLATFORM_BUDGET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  _caps := public._paige_voice_platform_budget_capabilities(_actor);
  IF NOT ('voice.budget.configure_platform' = ANY(_caps)) THEN
    RAISE EXCEPTION 'PAIGE_VOICE_PLATFORM_BUDGET_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL OR _emergency_disabled IS NULL
     OR _monthly_limit_usd IS NULL OR _monthly_limit_usd < 0
     OR _max_usd_per_1000_chars IS NULL OR _max_usd_per_1000_chars < 0
     OR (_enabled AND NOT _emergency_disabled
         AND (_monthly_limit_usd <= 0 OR _max_usd_per_1000_chars <= 0)) THEN
    RAISE EXCEPTION 'PAIGE_VOICE_PLATFORM_BUDGET_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.paige_voice_platform_budget(
    singleton, enabled, emergency_disabled, monthly_limit_usd,
    max_usd_per_1000_chars, updated_by, updated_at
  ) VALUES (
    true, _enabled, _emergency_disabled, _monthly_limit_usd,
    _max_usd_per_1000_chars, _actor, now()
  )
  ON CONFLICT (singleton) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        emergency_disabled = EXCLUDED.emergency_disabled,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        max_usd_per_1000_chars = EXCLUDED.max_usd_per_1000_chars,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  INSERT INTO public.paige_audit_log(
    actor_user_id, actor_role, action, target_type, payload
  ) VALUES (
    _actor, 'platform_owner', 'voice.budget.platform.configure',
    'paige_voice_platform_budget',
    jsonb_build_object(
      'enabled', _enabled,
      'emergency_disabled', _emergency_disabled,
      'monthly_limit_usd', _monthly_limit_usd,
      'max_usd_per_1000_chars', _max_usd_per_1000_chars
    )
  );

  RETURN jsonb_build_object(
    'enabled', _enabled,
    'emergency_disabled', _emergency_disabled,
    'monthly_limit_usd', _monthly_limit_usd,
    'max_usd_per_1000_chars', _max_usd_per_1000_chars,
    'updated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_paige_voice_cost_internal(
  _actor_user_id uuid,
  _tenant_id uuid,
  _profile_revision text,
  _request_ref uuid,
  _character_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _platform public.paige_voice_platform_budget%ROWTYPE;
  _tenant public.paige_voice_tenant_budgets%ROWTYPE;
  _profile public.paige_voice_profiles%ROWTYPE;
  _ready public.paige_voice_readiness%ROWTYPE;
  _verification public.paige_voice_provider_verifications%ROWTYPE;
  _existing public.paige_voice_cost_reservations%ROWTYPE;
  _budget_month date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  _tenant_used numeric;
  _platform_used numeric;
  _reserve numeric;
  _id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _actor_user_id IS NULL OR _tenant_id IS NULL OR _request_ref IS NULL
     OR _character_count IS NULL OR _character_count <= 0
     OR nullif(btrim(_profile_revision), '') IS NULL THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _actor_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_SCOPE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  -- Lock the singleton first and the tenant row second. Every request uses the
  -- same order, preventing oversubscription and lock inversion across tenants.
  SELECT * INTO _platform
  FROM public.paige_voice_platform_budget
  WHERE singleton = true
  FOR UPDATE;
  IF _platform.singleton IS NULL OR NOT _platform.enabled
     OR _platform.emergency_disabled
     OR _platform.monthly_limit_usd <= 0
     OR _platform.max_usd_per_1000_chars <= 0 THEN
    RAISE EXCEPTION 'PAIGE_VOICE_BUDGET_DISABLED' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _tenant
  FROM public.paige_voice_tenant_budgets
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  IF _tenant.tenant_id IS NULL OR NOT _tenant.enabled OR _tenant.monthly_limit_usd <= 0 THEN
    RAISE EXCEPTION 'PAIGE_VOICE_TENANT_BUDGET_DISABLED' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO _profile
  FROM public.paige_voice_profiles
  WHERE slot = 'active' AND revision = _profile_revision AND approved AND active;
  IF _profile.slot IS NULL OR _profile.provider NOT IN ('elevenlabs','openai') THEN
    RAISE EXCEPTION 'PAIGE_VOICE_PROFILE_UNAVAILABLE' USING ERRCODE = '55000';
  END IF;

  -- ElevenLabs keeps the pre-existing provider-account proof gate. OpenAI uses
  -- the same budget path but has no V1a account-proof activation change.
  IF _profile.provider = 'elevenlabs' THEN
    SELECT * INTO _ready FROM public.paige_voice_readiness WHERE singleton = true;
    SELECT * INTO _verification
    FROM public.paige_voice_provider_verifications
    WHERE id = _ready.provider_verification_id
      AND id = _profile.provider_verification_id
      AND provider = 'elevenlabs'
      AND provider_voice_ref = _profile.provider_voice_ref
      AND evidence_ref = _ready.account_verification_receipt_ref;
    IF _verification.id IS NULL OR NOT _ready.transport_enabled
       OR NOT _ready.key_scope_verified OR NOT _ready.voice_authorized
       OR NOT _ready.retention_policy_approved OR NOT _ready.zero_retention_confirmed
       OR NOT _ready.quota_verified OR NOT _verification.key_scope_verified
       OR NOT _verification.voice_authorized OR NOT _verification.retention_policy_approved
       OR NOT _verification.zero_retention_confirmed OR NOT _verification.quota_verified THEN
      RAISE EXCEPTION 'PAIGE_VOICE_PROVIDER_PROOF_OWED' USING ERRCODE = '55000';
    END IF;
  END IF;

  SELECT * INTO _existing
  FROM public.paige_voice_cost_reservations
  WHERE request_ref = _request_ref;
  IF _existing.id IS NOT NULL THEN
    IF _existing.actor_user_id <> _actor_user_id
       OR _existing.tenant_id IS DISTINCT FROM _tenant_id
       OR _existing.profile_revision <> _profile_revision
       OR _existing.character_count <> _character_count
       OR _existing.provider <> _profile.provider
       OR _existing.budget_month <> _budget_month
       THEN
      RAISE EXCEPTION 'PAIGE_VOICE_COST_IDEMPOTENCY_MISMATCH' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'reservation_id', _existing.id,
      'reserved_usd', _existing.reserved_usd,
      'provider', _existing.provider,
      'budget_month', _existing.budget_month,
      'state', _existing.state,
      'replayed', true
    );
  END IF;

  _reserve := (_character_count::numeric / 1000) * _platform.max_usd_per_1000_chars;

  -- Unique month buckets plus ON CONFLICT are the concurrency boundary. Unlike
  -- an aggregate or ordinary UPDATE inside a waiting function statement, the
  -- conflict path observes and guards the latest concurrently committed tuple.
  INSERT INTO public.paige_voice_tenant_monthly_usage(tenant_id, budget_month, reserved_usd)
  VALUES (_tenant_id, _budget_month, _reserve)
  ON CONFLICT (tenant_id, budget_month) DO UPDATE
    SET reserved_usd = public.paige_voice_tenant_monthly_usage.reserved_usd + EXCLUDED.reserved_usd
    WHERE public.paige_voice_tenant_monthly_usage.reserved_usd + EXCLUDED.reserved_usd
          <= _tenant.monthly_limit_usd
  RETURNING reserved_usd INTO _tenant_used;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAIGE_VOICE_TENANT_COST_LIMIT' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.paige_voice_platform_monthly_usage(budget_month, reserved_usd)
  VALUES (_budget_month, _reserve)
  ON CONFLICT (budget_month) DO UPDATE
    SET reserved_usd = public.paige_voice_platform_monthly_usage.reserved_usd + EXCLUDED.reserved_usd
    WHERE public.paige_voice_platform_monthly_usage.reserved_usd + EXCLUDED.reserved_usd
          <= _platform.monthly_limit_usd
  RETURNING reserved_usd INTO _platform_used;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAIGE_VOICE_PLATFORM_COST_LIMIT' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.paige_voice_cost_reservations(
    request_ref, tenant_id, actor_user_id, profile_revision, provider,
    character_count, reserved_usd, rate_usd_per_1000_chars,
    budget_month, state
  ) VALUES (
    _request_ref, _tenant_id, _actor_user_id, _profile_revision, _profile.provider,
    _character_count, _reserve, _platform.max_usd_per_1000_chars,
    _budget_month, 'reserved'
  )
  RETURNING id INTO _id;

  RETURN jsonb_build_object(
    'reservation_id', _id,
    'reserved_usd', _reserve,
    'provider', _profile.provider,
    'budget_month', _budget_month,
    'state', 'reserved',
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_paige_voice_cost_internal(
  _reservation_id uuid,
  _actor_user_id uuid,
  _outcome text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reservation public.paige_voice_cost_reservations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _outcome NOT IN ('committed','released','ambiguous') THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_INVALID_OUTCOME' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _reservation
  FROM public.paige_voice_cost_reservations
  WHERE id = _reservation_id AND actor_user_id = _actor_user_id
  FOR UPDATE;
  IF _reservation.id IS NULL THEN
    RAISE EXCEPTION 'PAIGE_VOICE_COST_RESERVATION_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF _reservation.state = _outcome THEN
    RETURN;
  END IF;
  IF _reservation.state = 'reserved'
     OR (_reservation.state = 'ambiguous' AND _outcome IN ('committed','released')) THEN
    UPDATE public.paige_voice_cost_reservations
    SET state = _outcome, settled_at = now()
    WHERE id = _reservation_id;
    IF _outcome = 'released' THEN
      UPDATE public.paige_voice_platform_monthly_usage
      SET reserved_usd = GREATEST(0, reserved_usd - _reservation.reserved_usd)
      WHERE budget_month = _reservation.budget_month;
      UPDATE public.paige_voice_tenant_monthly_usage
      SET reserved_usd = GREATEST(0, reserved_usd - _reservation.reserved_usd)
      WHERE tenant_id = _reservation.tenant_id
        AND budget_month = _reservation.budget_month;
    END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION 'PAIGE_VOICE_COST_SETTLEMENT_CONFLICT' USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public._paige_voice_tenant_budget_capabilities(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._paige_voice_platform_budget_capabilities(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._paige_voice_tenant_budget_capabilities(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._paige_voice_platform_budget_capabilities(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.set_paige_voice_tenant_budget(uuid,boolean,numeric)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_paige_voice_platform_budget(boolean,boolean,numeric,numeric)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_paige_voice_tenant_budget(uuid,boolean,numeric)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_paige_voice_platform_budget(boolean,boolean,numeric,numeric)
  TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_paige_voice_cost_internal(uuid,uuid,text,uuid,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_paige_voice_cost_internal(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paige_voice_cost_internal(uuid,uuid,text,uuid,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_paige_voice_cost_internal(uuid,uuid,text)
  TO service_role;
