-- Systems Check must read a run that actually covered everything.
--
-- THE DEFECT
--
-- `_shared/systems-check-runner.ts:239-240` accepts a `runnerKeys` filter, and
-- `systems-check-run-change` passes exactly ONE key per changed surface. Such a run therefore
-- writes one finding and carries `check_count = 1` — because check_count is set at INSERT to the
-- number of registry rows THIS RUN SELECTED, not the size of the sweep.
--
-- `systems_check_snapshot` reads the caller's LATEST run and returns only that run's findings. So a
-- one-check run becomes the tenant's whole picture: the tile renders "1 of 1 passed" behind an
-- "All clear" pill, nine checks — including real failures — are simply absent, and no incomplete
-- banner fires, because `recorded(1) > readable(1)` is false.
--
-- That path is wired to a control the owner uses. `rescanBusinessContext` fires three change runs
-- on EVERY successful Solo Setup save (`useSoloSetupBrief.ts:187`), and the edge function is ACTIVE.
-- Production carries ZERO change_triggered runs (937 scheduled, 4 onboarding) and that wiring
-- shipped 2026-09-03, so this is a LOADED TRIGGER, not a live defect. The next save pulls it.
--
-- THE GUARD, and why it is two clauses rather than one
--
--   selected_runner_keys IS NULL   -- the durable marker, keyed on the MECHANISM
--   AND scan_flavor <> 'change_triggered'  -- the belt, keyed on the one known name
--
-- The column is written by the runner from the same `opts.runnerKeys` that drives the filter, so a
-- FUTURE partial flavour records itself with no change to this SQL. An exclusion list alone would
-- fail open, silently, for any flavour added later.
--
-- But the column alone would leave a hole until the edge bundle that writes it is deployed — and
-- the two CI pipelines have no ordering link. The flavour clause closes that window: this migration
-- is EFFECTIVE ON ITS OWN, against every historical and in-flight change run, with no backfill and
-- no sentinel value. The edge change that follows is future-proofing, not a required second half.
-- Both clauses fail CLOSED; neither can be relied on alone.
--
-- WHAT THIS IS NOT
--
-- It is not the durable fix. A partial run still WRITES its findings; they are simply not read as
-- the whole picture. Reading the newest result PER CHECK (task #19) removes the category error
-- entirely and is the real repair.
--
-- And it has an honest cost, stated rather than buried: the console now reads the last FULL sweep,
-- which today averages ~17h old. Inside that window a tenant can make a check WORSE — clear their
-- website, drop their phone — and the console will still show the older passing result. STALE
-- EVIDENCE only renders past 24h, so that gap is unmarked. This trades a loud, flattering lie
-- ("All clear" over hidden failures) for a quiet, stale one. That is the safer direction, but it is
-- a real trade and not a strict improvement.
--
-- `resolve_systems_check_signal_reference` is deliberately NOT guarded: `supabase/tests/
-- systems_check_signal_reference.sql:308-315` asserts that an incomplete change run SUPERSEDES the
-- current reference, which is correct fail-closed behaviour for a signal token.
--
-- §9/§51/§59: no caller-scope surface changes. Both functions keep their in-body tenant/operator
-- gates untouched; this adds conjuncts to a row filter INSIDE the already-established scope.

ALTER TABLE public.paige_systems_check_run
  ADD COLUMN IF NOT EXISTS selected_runner_keys text[];

COMMENT ON COLUMN public.paige_systems_check_run.selected_runner_keys IS
  'The subset of runner_keys this run scanned, or NULL when no filter was applied. Written by '
  '_shared/systems-check-runner.ts from the same opts.runnerKeys that drives its '
  '.in("runner_key", ...) filter, so partiality is recorded from the condition that CAUSES it '
  'rather than from a flavour name. Read by systems_check_snapshot() and '
  'approve_systems_check_finding() to select the latest FULL sweep. Rows written before this '
  'column existed are NULL; they are additionally covered by the scan_flavor clause in those '
  'functions, so NULL is not relied upon as proof of a full sweep.';

-- 1) The console read.
CREATE OR REPLACE FUNCTION public.systems_check_snapshot(p_scope text DEFAULT 'tenant'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 1) Latest FULL-SWEEP run for this scope.
  --    The scope predicate is unchanged and now explicitly parenthesised — an unparenthesised
  --    `a OR b AND c` would have bound the new conjunct to only one side of the scope test and
  --    quietly widened the operator branch.
  SELECT to_jsonb(r) - 'tenant_id' - 'scan_flavor' - 'triggered_by' - 'created_at', r.id
    INTO v_run, v_run_id
  FROM (
    SELECT id, started_at, completed_at, check_count, pass_count, fail_count
    FROM public.paige_systems_check_run
    WHERE ((v_operator AND tenant_id IS NULL)
        OR (NOT v_operator AND tenant_id = v_tenant))
      AND selected_runner_keys IS NULL
      AND scan_flavor <> 'change_triggered'
    -- Tiebreak added: this ordering was `started_at DESC` alone while its two sibling functions
    -- already used the full three-column form. Three change runs fire within milliseconds of one
    -- Setup save, so ties are reachable, and an unstable pick is an unstable console.
    ORDER BY started_at DESC, created_at DESC, id DESC
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

  -- 2) Findings for that run + the registry join.
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
$function$;

-- 2) The approve path — guarded with the SAME predicate, in the same migration, deliberately.
--
-- Guarding only the console would split the truth in two: the surface would re-display the real
-- failures while this function still resolved "latest" to the change run and rejected every
-- Approve with SYSTEMS_CHECK_APPROVAL_UNAVAILABLE, surfaced raw as "Couldn't record that approval."
-- (SystemsCheckTile.tsx:174). Two functions computing one truth differently is the §57 shape.
--
-- Consequence, stated: a finding produced by a change run becomes neither shown nor approvable.
-- That is coherent, and its approvability window was already capped at 24h by the completed_at
-- clause below and superseded by the next scheduled sweep regardless.
--
-- CONDITIONAL, and worth knowing: this restores approvability only while the latest FULL sweep is
-- under 24h old. That holds today (~17h on all 14 tenants) ONLY because the cron reaches every
-- tenant. `systems-check-run-scheduled` pages with `DEFAULT_BATCH = 15`, ordered by created_at ASC
-- with no cursor — so from tenant 16 the newest are never swept, and on such a tenant EVERY
-- approval would fail permanently. Tracked separately; noted here because this function is where
-- it would surface.
CREATE OR REPLACE FUNCTION public.approve_systems_check_finding(p_scope text, p_account_number bigint, p_finding_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    IF NOT public.is_platform_operator() THEN
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
          -- Same full-sweep predicate as systems_check_snapshot, so the console and this
          -- function can never disagree about which run is "latest" (§57).
          AND latest.selected_runner_keys IS NULL
          AND latest.scan_flavor <> 'change_triggered'
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
$function$;
