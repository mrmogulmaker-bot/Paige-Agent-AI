-- Owner first-run onboarding state (§9/§10) — so a brand-new tenant owner lands on
-- /admin with a guided welcome instead of being dropped on a cold dashboard.
--
-- The completion state is TENANT-SCOPED, stored on public.tenants (not React state
-- or localStorage), and read/written ONLY through the two Paige-callable RPCs below
-- (§10: no dead-end that only a human clicking can drive — Paige can mark a step or
-- dismiss the welcome the same way the UI does). Shape:
--   { "dismissed": bool, "completed_at": timestamptz, "steps": { "<step_key>": true } }
--
-- Auth mirrors 20260711160000_paige_onboarding_tools.sql: SECURITY DEFINER,
-- search_path pinned, dual-caller. The authenticated (JWT) path is role-gated to an
-- active owner/admin of p_tenant_id, so the p_tenant_id IDOR class stays closed; the
-- trusted service/Paige path (no auth.uid()) passes p_tenant_id explicitly.
-- Tenant-generic (§2) — this holds no vertical/finance content, only step flags.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- (A) get_owner_onboarding_state — read this tenant's onboarding progress.
CREATE OR REPLACE FUNCTION public.get_owner_onboarding_state(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _state jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_NO_TENANT' USING ERRCODE = '22023';
  END IF;
  -- Auth gate BEFORE any read. JWT caller must be an active owner/admin of THIS
  -- tenant; the trusted service/Paige path (no auth.uid()) is allowed through.
  IF _caller IS NOT NULL THEN
    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_tenant_owner(_caller, p_tenant_id)) THEN
      RAISE EXCEPTION 'ONBOARDING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(t.onboarding_state, '{}'::jsonb) INTO _state
    FROM public.tenants t WHERE t.id = p_tenant_id;

  IF _state IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_TENANT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  RETURN _state;
END $$;

-- (B) set_owner_onboarding_state — shallow-merge a patch into onboarding_state and
-- return the new value. Used for mark-step-done, dismiss, and complete. Because the
-- `||` merge is shallow, callers that touch `steps` pass the FULL merged steps object.
CREATE OR REPLACE FUNCTION public.set_owner_onboarding_state(p_tenant_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _state jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_NO_TENANT' USING ERRCODE = '22023';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'ONBOARDING_BAD_PATCH' USING ERRCODE = '22023';
  END IF;
  -- Auth gate BEFORE any write. Same rule as the read seam.
  IF _caller IS NOT NULL THEN
    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_tenant_owner(_caller, p_tenant_id)) THEN
      RAISE EXCEPTION 'ONBOARDING_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.tenants t
     SET onboarding_state = COALESCE(t.onboarding_state, '{}'::jsonb) || p_patch
   WHERE t.id = p_tenant_id
  RETURNING t.onboarding_state INTO _state;

  IF _state IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_TENANT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  RETURN _state;
END $$;

REVOKE ALL ON FUNCTION public.get_owner_onboarding_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_onboarding_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_owner_onboarding_state(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_owner_onboarding_state(uuid, jsonb) TO authenticated, service_role;
