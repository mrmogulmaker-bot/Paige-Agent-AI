-- A run that never finished is not the latest reading.
--
-- WHAT IS WRONG TODAY. `systems_check_snapshot` and `approve_systems_check_finding` both resolve
-- "the latest full sweep" with
--
--     selected_runner_keys IS NULL AND scan_flavor <> 'change_triggered'
--     ORDER BY started_at DESC, created_at DESC, id DESC LIMIT 1
--
-- and neither one asks whether that run FINISHED. The runner inserts the run row before dispatching
-- the first check (`_shared/systems-check-runner.ts:299-308`) and patches pass/fail counts only at
-- the end (`:490-498`), so for the whole length of a scan there is a newest, eligible, empty run.
--
-- Two consequences, both real:
--
--   * THE CONSOLE EMPTIES WHILE THE CHECKS RUN. It reads findings by `run_id`, so it pins the
--     in-flight run and finds nothing under it. The surface then renders "The last run left no
--     readable results at all" -- during a normal, healthy scan.
--   * APPROVE DIES, AND CAN DIE PERMANENTLY. The gate requires `_finding.run_id` to equal the
--     resolved latest id. The finding belongs to the completed run; latest resolves to the in-flight
--     one; they never match, so every Approve raises SYSTEMS_CHECK_APPROVAL_UNAVAILABLE. If the scan
--     crashes rather than completing, that row stays newest and the tenant's Approve is dead for
--     good.
--
-- IT IS LATENT, NOT ACTIVE, AND THE NUMBERS ARE WHY. Measured on prod before writing this: 959 run
-- rows, 5 with `completed_at IS NULL`, all 5 eligible to be "latest" -- and 0 tenants for whom one
-- of them currently IS latest, because a later completed run outranks each. Three of those five are
-- onboarding runs, which is the flavor that files a remediation draft for EVERY fail; the drafts are
-- sequential and average 27s each, so the flavor most likely to time out is the one that produces
-- these rows. Nothing is broken for a tenant this minute. The window is ~30-90s once a day, at
-- 09:00 UTC, when nobody is looking.
--
-- WHY IT IS BEING FIXED NOW ANYWAY. A tenant-facing "run the checks again" control (task #28) turns
-- that unwatched daily window into something a person triggers deliberately and then WATCHES. The
-- first press would blank the console. This must land before the button exists, not after.
--
-- I SHIPPED THIS. Migration 20261203000000 (PR #935) wrote both predicates and this clause is
-- missing from both. The peer-gate pass on that PR did not catch it; a later adversarial pass
-- against the same seam did.
--
-- WHAT THIS CHANGES FOR A READER (§58, stated rather than absorbed):
--   * While a scan is in flight, both functions now resolve to the last COMPLETED full sweep instead
--     of the empty new one. The console keeps showing the previous reading and its real timestamp.
--   * `systems_check_snapshot` gains `scan_in_progress` in its payload so the caller is not left
--     inferring from silence that nothing is happening. It is TIME-BOUNDED (15 minutes) because the
--     orphan rows never complete and an unbounded EXISTS would claim a scan was running forever.
--     Nothing renders it yet -- the control that makes it visible is task #28, and how it reads is
--     Claude Design's (§00). Added here rather than there so this function is replaced once.
--   * The five orphan rows stop being able to become "latest" at all. No tenant loses a reading:
--     each already had a completed run ranked above its orphan.
--
-- §37: `systems_check_snapshot` has one consumer (`src/hooks/useSystemsCheck.ts:128`) and
-- `approve_systems_check_finding` has one (`src/components/systems-check/SystemsCheckTile.tsx:168`).
-- Both receive a superset of today's payload; no field is renamed or removed.
--
-- Bodies below are byte-identical to 20261203000000 except for the clauses this file adds -- both
-- were extracted programmatically from that file and patched, so the unrelated text cannot drift.
-- `create or replace` preserves the existing ACLs and the REVOKEs applied to these functions.

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
  v_scan_in_progress boolean := false;
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
      -- A run that never finished is not a reading. The runner inserts the run row BEFORE the
      -- first check and patches the counts at the end, so between those two moments the row is
      -- eligible here with zero findings written. Without this clause an in-flight scan becomes
      -- "latest" the instant it starts, and the console -- which reads findings by run_id -- shows
      -- none and says the last run left no readable results, while the checks are running normally.
      -- Worse, a scan that dies mid-loop leaves that row newest forever. Prod carries 5 such rows
      -- out of 959 (three of the four onboarding runs ever executed); none is currently its
      -- tenant's newest, which is the only reason this has not bitten yet.
      AND completed_at IS NOT NULL
    -- Tiebreak added: this ordering was `started_at DESC` alone while both sibling functions
    -- already used the full three-column form, and two resolvers that can disagree on which run is
    -- "latest" is the §57 shape this migration exists to close. (An earlier draft justified it with
    -- "three change runs fire within milliseconds of a Setup save" — true, but those rows are
    -- excluded two lines above, so that tie cannot occur in THIS set. Parity is the real reason.)
    ORDER BY started_at DESC, created_at DESC, id DESC
    LIMIT 1
  ) r;

  -- Having excluded the in-flight run from the reading, we owe the caller the fact that it exists
  -- -- otherwise the console silently shows an older sweep with no hint a newer one is underway.
  -- TIME-BOUNDED deliberately: the orphan rows above never complete, so an unbounded EXISTS would
  -- report "a scan is running" on those tenants forever. Measured run durations on prod are 26-92s,
  -- so 15 minutes is far outside a healthy run and anything older is a crash, not progress (§13).
  SELECT EXISTS (
    SELECT 1
      FROM public.paige_systems_check_run
     WHERE ((v_operator AND tenant_id IS NULL)
         OR (NOT v_operator AND tenant_id = v_tenant))
       AND selected_runner_keys IS NULL
       AND scan_flavor <> 'change_triggered'
       AND completed_at IS NULL
       AND started_at >= now() - interval '15 minutes'
  ) INTO v_scan_in_progress;

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
      'tenant_created_at', v_tenant_created,
      'scan_in_progress', v_scan_in_progress
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
    'tenant_created_at', v_tenant_created,  -- always NULL here (a run exists); tile only reads it when run is null
    'scan_in_progress', v_scan_in_progress
  );
END;
$function$;

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
          -- Same clause as systems_check_snapshot, and it MUST stay identical (§57). Without it an
          -- in-flight run wins `latest.id`, never equals the completed `_finding.run_id`, and every
          -- Approve raises SYSTEMS_CHECK_APPROVAL_UNAVAILABLE for the length of the scan -- or
          -- permanently, if that scan dies. Note the asymmetry this repairs: the outer query has
          -- always required `r.completed_at IS NOT NULL` of the finding's own run; the subquery
          -- that decides which run is "latest" never did.
          AND latest.completed_at IS NOT NULL
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