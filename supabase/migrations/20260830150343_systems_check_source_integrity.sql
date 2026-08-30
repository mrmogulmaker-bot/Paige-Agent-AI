-- Systems Check source-integrity boundary.
--
-- The scan runner remains the only service-role writer of run/finding truth. Authenticated
-- callers retain tenant/operator-scoped reads, but all direct run, finding, and baseline
-- mutations are removed. The one existing human operation -- approving the current failed
-- finding -- moves behind a fail-closed server seam that preserves the existing Action Bus.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.paige_systems_check_run FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.paige_systems_check_finding FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.paige_systems_check_baseline FROM authenticated;

GRANT SELECT ON public.paige_systems_check_run TO authenticated;
GRANT SELECT ON public.paige_systems_check_finding TO authenticated;
GRANT SELECT ON public.paige_systems_check_baseline TO authenticated;

DROP POLICY IF EXISTS scrun_tenant_all ON public.paige_systems_check_run;
DROP POLICY IF EXISTS scrun_tenant_read ON public.paige_systems_check_run;
CREATE POLICY scrun_tenant_read ON public.paige_systems_check_run
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.is_platform_owner())
  );

DROP POLICY IF EXISTS scfind_tenant_all ON public.paige_systems_check_finding;
DROP POLICY IF EXISTS scfind_tenant_read ON public.paige_systems_check_finding;
CREATE POLICY scfind_tenant_read ON public.paige_systems_check_finding
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.is_platform_owner())
  );

DROP POLICY IF EXISTS scbase_tenant_all ON public.paige_systems_check_baseline;
DROP POLICY IF EXISTS scbase_tenant_read ON public.paige_systems_check_baseline;
CREATE POLICY scbase_tenant_read ON public.paige_systems_check_baseline
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_user_tenant_id())
    OR (SELECT public.is_platform_owner())
  );

CREATE OR REPLACE FUNCTION public.approve_systems_check_finding(
  p_scope text,
  p_account_number bigint,
  p_finding_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _tenant_id uuid;
  _authorized boolean := false;
  _finding public.paige_systems_check_finding%ROWTYPE;
  _run public.paige_systems_check_run%ROWTYPE;
  _action public.paige_actions%ROWTYPE;
  _action_result jsonb;
  _action_status text;
BEGIN
  IF _actor_id IS NULL
     OR p_scope NOT IN ('tenant', 'operator')
     OR p_finding_id IS NULL
     OR (p_scope = 'tenant' AND p_account_number IS NULL)
     OR (p_scope = 'operator' AND p_account_number IS NOT NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
  END IF;

  IF p_scope = 'tenant' THEN
    SELECT p.active_tenant_id
      INTO _tenant_id
      FROM public.profiles p
     WHERE p.user_id = _actor_id;

    IF _tenant_id IS NULL
       OR public.current_user_tenant_id() IS DISTINCT FROM _tenant_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;

    -- account_number is introduced after Systems Check in the committed migration history.
    -- Dynamic SQL keeps timestamp-order replay valid while the deployed function still treats
    -- the route account as an address only and compares it with server-resolved identity.
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
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;
  ELSE
    IF NOT public.is_platform_owner(_actor_id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;
    _tenant_id := NULL;
  END IF;

  SELECT f.*
    INTO _finding
    FROM public.paige_systems_check_finding f
   WHERE f.id = p_finding_id
     AND f.tenant_id IS NOT DISTINCT FROM _tenant_id
     AND f.status = 'fail'
     AND f.resolved_at IS NULL
     AND f.resolution IS NULL
   FOR UPDATE;

  IF _finding.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
  END IF;

  SELECT r.*
    INTO _run
    FROM public.paige_systems_check_run r
   WHERE r.id = _finding.run_id
     AND r.tenant_id IS NOT DISTINCT FROM _tenant_id
     AND r.completed_at IS NOT NULL
     AND r.started_at <= r.completed_at
     AND r.completed_at <= now()
     AND r.completed_at >= now() - interval '24 hours'
     AND r.id = (
       SELECT latest.id
         FROM public.paige_systems_check_run latest
        WHERE latest.tenant_id IS NOT DISTINCT FROM _tenant_id
        ORDER BY latest.started_at DESC, latest.created_at DESC, latest.id DESC
        LIMIT 1
     );

  IF _run.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
  END IF;

  IF _finding.resolution_action_id IS NOT NULL THEN
    IF p_scope <> 'tenant' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;

    SELECT a.*
      INTO _action
      FROM public.paige_actions a
     WHERE a.id = _finding.resolution_action_id
       AND a.tenant_id = _tenant_id
       AND a.action_kind = 'systems.remediate'
       AND a.payload ->> 'finding_id' = _finding.id::text
       AND a.payload ->> 'run_id' = _finding.run_id::text
     FOR UPDATE;

    IF _action.id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;

    _action_result := public.advance_action(
      p_action_id => _action.id,
      p_to_status => 'executing'
    );
    _action_status := _action_result ->> 'status';

    IF NOT COALESCE((_action_result ->> 'ok')::boolean, false)
       OR _action_status <> 'done' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
    END IF;
  END IF;

  UPDATE public.paige_systems_check_finding f
     SET resolution = 'approved',
         resolved_at = now()
   WHERE f.id = _finding.id;

  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (
    _actor_id,
    'systems_check_finding',
    'approve',
    _finding.id,
    jsonb_build_object(
      'scope', p_scope,
      'run_id', _finding.run_id,
      'action_id', _finding.resolution_action_id,
      'account_number', p_account_number
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'finding_id', _finding.id,
    'status', 'approved',
    'action_status', _action_status
  );
EXCEPTION
  WHEN SQLSTATE '42501' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
  WHEN OTHERS THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SYSTEMS_CHECK_APPROVAL_UNAVAILABLE';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_systems_check_finding(text, bigint, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_systems_check_finding(text, bigint, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.approve_systems_check_finding(text, bigint, uuid) IS
  'Records the one existing human Systems Check decision through a tenant/account/role/current-source gate. Optionally advances only the finding-linked systems.remediate Action Bus item. Never accepts evidence, finding truth, action payload, prompts, or arbitrary status fields from the caller.';

COMMENT ON TABLE public.paige_systems_check_finding IS
  'Runner-authored Systems Check truth. Authenticated callers may read rows allowed by RLS but cannot insert, update, or delete them directly. Human approval uses approve_systems_check_finding().';

COMMIT;
