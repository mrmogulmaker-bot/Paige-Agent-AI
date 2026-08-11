-- Systems Check load-perf (task #122, §30 diagnosis): collapse the tile's 2–3 serialized
-- PostgREST round-trips per mount into ONE round-trip. This RPC returns the SAME rows the
-- hook's Query A (latest run) + Query B (findings + registry embed) + Query C (tenant
-- created_at) return today — a TRANSPORT MERGE, not a semantics change (§13). No filter is
-- widened or narrowed: tenant scope keys on the caller's own resolved tenant; operator scope
-- on the tenant-less (tenant_id IS NULL) operator lens — byte-identical to the current hook.
--
-- §59 CALLER-SCOPE ENFORCED IN-BODY (this is exactly the DEFINER-data-returner class §59
-- governs). SECURITY DEFINER bypasses RLS, so the BODY re-enforces the caller's scope:
--   • p_scope='tenant'   → tenant is DERIVED from public.current_user_tenant_id() (NEVER a
--     client param). NULL tenant → return the honest empty snapshot (no data), matching the
--     hook's "no resolved tenant → disabled/empty" posture.
--   • p_scope='operator' → gated on public.is_platform_operator(): a non-operator RAISEs
--     42501 (never silently returns tenant rows). Queries only the tenant_id IS NULL lens.
--   • any other p_scope   → RAISE 22023 (reject unknown scope; never fall through to data).
-- EXECUTE is granted to `authenticated` only — NEVER anon (§59: the grant is never the guard,
-- but anon has no place on this seam at all).

CREATE OR REPLACE FUNCTION public.systems_check_snapshot(p_scope text DEFAULT 'tenant')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant        uuid;
  v_operator      boolean := false;
  v_run           jsonb;
  v_run_id        uuid;
  v_findings      jsonb;
  v_tenant_created timestamptz;
BEGIN
  IF p_scope = 'tenant' THEN
    -- Tenant is derived IN-BODY from the verified session — never a client-supplied param (§59/§9).
    v_tenant := public.current_user_tenant_id();
    IF v_tenant IS NULL THEN
      -- No resolved tenant → no data (the hook's disabled/empty posture; §13 honest).
      RETURN jsonb_build_object('run', NULL, 'findings', '[]'::jsonb, 'tenant_created_at', NULL);
    END IF;
  ELSIF p_scope = 'operator' THEN
    -- Operator lens is platform-operator-only; a non-operator caller never sees it (§53/§9).
    IF NOT public.is_platform_operator() THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
    v_operator := true;
  ELSE
    RAISE EXCEPTION 'invalid scope: %', p_scope USING ERRCODE = '22023';
  END IF;

  -- 1) Latest scan run for this scope — same predicate/order/limit as hook Query A.
  --    (tenant → tenant_id = v_tenant; operator → tenant_id IS NULL.)
  SELECT to_jsonb(r) - 'tenant_id' - 'scan_flavor' - 'triggered_by' - 'created_at', r.id
    INTO v_run, v_run_id
  FROM (
    SELECT id, started_at, completed_at, check_count, pass_count, fail_count
    FROM public.paige_systems_check_run
    WHERE (v_operator AND tenant_id IS NULL)
       OR (NOT v_operator AND tenant_id = v_tenant)
    ORDER BY started_at DESC
    LIMIT 1
  ) r;

  IF v_run_id IS NULL THEN
    -- No run yet. For TENANT scope, read created_at so the tile can honestly distinguish
    -- "first scan still running" from the terminal empty state (§13; hook Query C). Operator
    -- scope is cron-driven — no per-tenant recency signal (null).
    IF NOT v_operator THEN
      SELECT created_at INTO v_tenant_created FROM public.tenants WHERE id = v_tenant;
    END IF;
    RETURN jsonb_build_object(
      'run', NULL,
      'findings', '[]'::jsonb,
      'tenant_created_at', v_tenant_created
    );
  END IF;

  -- 2) Findings for that run + the registry join — same columns/predicate as hook Query B.
  --    LEFT JOIN so a finding with no registry row still returns (reg -> nulls), exactly as
  --    the PostgREST embed produces. Ordered by created_at for a stable payload (the tile
  --    re-sorts client-side via rankFinding regardless).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'run_id', f.run_id,
        'check_id', f.check_id,
        'status', f.status,
        'severity_at_finding', f.severity_at_finding,
        'evidence', f.evidence,
        'paige_interpretation', f.paige_interpretation,
        'paige_drafted_fix', f.paige_drafted_fix,
        'department_id', f.department_id,
        'resolved_at', f.resolved_at,
        'resolution', f.resolution,
        'resolution_action_id', f.resolution_action_id,
        'created_at', f.created_at,
        'reg', CASE
          WHEN reg.check_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'check_name', reg.check_name,
            'domain', reg.domain,
            'priority', reg.priority
          )
        END
      )
      ORDER BY f.created_at ASC
    ),
    '[]'::jsonb
  )
    INTO v_findings
  FROM public.paige_systems_check_finding f
  LEFT JOIN public.paige_systems_check_registry reg ON reg.check_id = f.check_id
  WHERE f.run_id = v_run_id
    AND (
      (v_operator AND f.tenant_id IS NULL)
      OR (NOT v_operator AND f.tenant_id = v_tenant)
    );

  RETURN jsonb_build_object(
    'run', v_run,
    'findings', v_findings,
    'tenant_created_at', v_tenant_created  -- always NULL here (a run exists); tile only reads it when run is null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.systems_check_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.systems_check_snapshot(text) TO authenticated;

COMMENT ON FUNCTION public.systems_check_snapshot(text) IS
  'Systems Check tile read (task #122): ONE-round-trip snapshot of the latest scan run + its findings (registry-joined) + tenant created_at, replacing the hook''s 2–3 serialized queries. §59 caller-scope enforced in-body: tenant scope derives tenant from current_user_tenant_id() (never a client param); operator scope gates on is_platform_operator(). EXECUTE granted to authenticated only.';
