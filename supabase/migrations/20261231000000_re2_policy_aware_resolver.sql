-- RE-2 SLICE PR-2 — THE POLICY-AWARE RESOLVER (the floor-lift oracle).
--
-- Owner ruling 2026-09-06 (autonomy-architecture.md §10.8 build order, item 2): "lift the blanket
-- `high`-action `confirm` floor ONLY when a specific valid standing policy authorizes the exact
-- action; no global 'high is now automatic' switch; missing/expired/revoked/ambiguous/stale/over-cap/
-- cross-scope fails closed; `confirm` becomes the escalation lane."
--
-- WHAT THIS SLICE IS. ONE new read-only oracle, `resolve_execution_autonomy`, that answers, PER ACT:
-- "given the standing grants on file, how autonomous may THIS act be right now?" It REUSES the shipped
-- arithmetic (min(grant, floor, ceiling) — 20261024000000) and the shipped bounds (`trust_effective_rung`
-- the §67/§68 ceiling; the `paige_action_kinds` act-floor; `resolve_tool_autonomy` the per-tool floor),
-- and adds ONE genuinely new bound that did not exist anywhere: a standing-grant authorization from the
-- RE-2 PR-1 substrate (`paige_authority_grants` + `authority_grant_active` + `authority_remaining_capacity`,
-- 20261230000000). A valid, active, in-scope grant with cap headroom lifts the ACT-FLOOR (only) to `auto`.
--
-- WHAT THIS SLICE IS NOT — ZERO BEHAVIORAL CHANGE, DARK BY CONSTRUCTION (§13/§32, mirroring PR-1).
--   • `resolve_automation_autonomy`, `resolve_tool_autonomy`, `trust_effective_rung`, `list_tool_autonomy`,
--     `paige_resolve_autonomy` and BOTH `paige_action_kinds` CHECKs are UNTOUCHED — every existing
--     producer returns byte-identical results.
--   • This new function has ZERO producers: no edge function, trigger, cron, frontend, CI or script calls
--     it. It is an unwired oracle, exactly like PR-1's unwired primitives. The 3 paige-ai-chat reporting
--     tools deliberately STILL read the unchanged `resolve_automation_autonomy`, so nothing over-claims
--     `auto` while no execution loop exists (PR-3). Re-pointing them here would be the §13 lie this slice
--     is built to avoid.
--   • Runtime claim = a `BEGIN..ROLLBACK`/`SET ROLE` proof of the oracle. The persisted-apply is owed to
--     CI `deploy-migrations` (§32.a); the authenticated end-to-end drive is owed to PR-3 when a real
--     execution lane consumes this oracle (§32.c).
--
-- DOCTRINE BINDINGS.
--   §10.7/§10.8 — the governing rule + build order; PR-2 is the "policy-aware resolver" step, dark until PR-3.
--   §18  — reuses the min(grant,floor,ceiling) home + the PR-1 substrate; forks NO arithmetic and NO
--          second oracle. It adds a new bound (standing-grant authorization), which is new capability.
--   §59  — SECURITY DEFINER bypasses RLS, so caller scope is re-asserted IN-BODY: a JWT caller must own
--          the automation's tenant (is_platform_owner OR is_tenant_member); the service role (auth.uid()
--          NULL) is Paige's trusted headless runtime; a stranger gets found:false (non-disclosure).
--   §67/§68 — a grant can never raise autonomy above the Trust Compass ceiling (`trust_effective_rung`);
--          the ceiling STILL binds. A valid grant SUPERSEDES the process's default `confirm` posture —
--          that is the whole point of a standing authorization, and it is necessary because the process
--          posture (`paige_automations.granted_lane`) is re-clamped to `confirm` every time its steps
--          change (`trg_paige_automation_acts_changed`), so a grant that deferred to it would never fire.
--          But an EXPLICIT `off` on the process is a kill switch a grant never overrides.
--   §51/§53 — the grant lookup keys on the AUTOMATION's `tenant_id` (never `current_user_tenant_id()`),
--          so the service-role runtime resolves the correct tenant; delegation never widens.
--   §10.9 — every lift returns the `grant_id` so a downstream act can CITE the specific authority.
--   fail-closed (§10.7) — EVERY non-ideal branch (no grant / expired / revoked / paused / stopped /
--          wrong tenant / out-of-scope / sub-scope-unverifiable / ambiguous / over-cap / unenforceable
--          cap kind / unreadable capacity) returns the BASE floor and never `auto`.

CREATE OR REPLACE FUNCTION public.resolve_execution_autonomy(
  _automation_id uuid,
  _act_key       text,
  _act_is_kind   boolean,
  _cost_usd      numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _a            record;
  _rung         int;
  _ceiling      text;
  _act_floor    text;
  _cost         numeric := COALESCE(_cost_usd, 0);
  _base_rank    int;
  _lifted_rank  int;
  _base_eff     text;
  _matches      uuid[];
  _n            int;
  _g            record;
  _cap          jsonb;
  _used         jsonb;
  _used_actions int;
  _used_spend   numeric;
  _reason       text;
  _capped_by    text;
BEGIN
  -- ── §59 IN-BODY SCOPE (identical posture to resolve_automation_autonomy L67-86) ──
  SELECT * INTO _a FROM public.paige_automations WHERE id = _automation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_platform_owner() OR public.is_tenant_member(_a.tenant_id)) THEN
    RETURN jsonb_build_object('found', false);   -- same shape as not-found: existence is a disclosure
  END IF;

  -- ── THE CEILING (§67/§68) — reused, never re-derived ──
  _rung := public.trust_effective_rung();
  _ceiling := CASE WHEN _rung <= 0 THEN 'off' WHEN _rung <= 1 THEN 'confirm' ELSE 'auto' END;

  -- ── THIS ACT'S OWN FLOOR (the RE-1 act-floor logic, for a single act) ──
  IF _act_is_kind THEN
    SELECT CASE WHEN k.requires_approval THEN 'confirm'
                ELSE COALESCE(k.default_autonomy_lane, 'confirm') END
      INTO _act_floor
      FROM public.paige_action_kinds k WHERE k.slug = _act_key;
    _act_floor := COALESCE(_act_floor, 'confirm');   -- unknown kind ⇒ ask (fail closed)
  ELSE
    _act_floor := public.resolve_tool_autonomy(_a.tenant_id, _act_key);
  END IF;

  -- ── THE BASE ANSWER (no grant): min(process grant, this act's floor, ceiling) ──
  _base_rank := LEAST(
    public.autonomy_lane_rank(_a.granted_lane),
    public.autonomy_lane_rank(_act_floor),
    public.autonomy_lane_rank(_ceiling));
  _base_eff := public.autonomy_lane_of_rank(_base_rank);

  -- ── THE GRANT LAYER — find grants that authorize THIS EXACT act, fail closed on ambiguity ──
  -- Keyed on the AUTOMATION's tenant (§51/§53), never the caller's. A grant matches iff it is active
  -- (§68 state/window/expiry/stops, via authority_grant_active), scoped to this tenant, standing OR for
  -- this automation, and lists this exact act in its allowlist. Grants carrying a per-target sub-scope
  -- PR-2 cannot verify (client_id / campaign_id — the act identity here has no concrete target) are
  -- EXCLUDED (fail closed); that verification is PR-3's, when the executor knows the target.
  SELECT array_agg(g.id) INTO _matches
    FROM public.paige_authority_grants g
   WHERE g.tenant_id = _a.tenant_id
     AND (g.automation_id IS NULL OR g.automation_id = _automation_id)
     AND NOT (g.scope ? 'client_id')
     AND NOT (g.scope ? 'campaign_id')
     AND (
       (_act_is_kind AND g.scope->'allowed_action_kinds' ? _act_key)
       OR ((NOT _act_is_kind) AND g.scope->'allowed_tool_keys' ? _act_key)
     )
     AND public.authority_grant_active(g.id);

  _n := COALESCE(array_length(_matches, 1), 0);

  IF _n = 0 THEN
    _reason := 'no_matching_grant';
  ELSIF _n > 1 THEN
    _reason := 'ambiguous_grant';           -- never pick one (§10.7 "ambiguous … clamp")
  ELSE
    -- Exactly one active in-scope grant. Peek at cap headroom WITHOUT reserving — PR-3's
    -- authority_reserve (its grant-row FOR UPDATE) is the atomic truth; this peek only avoids the
    -- oracle promising `auto` for a cap that reserve would then refuse. It MIRRORS authority_reserve's
    -- refusals (unenforceable cap kind + day/week/month + single-action) and MUST stay in lockstep with
    -- it: a new cap kind added to authority_reserve must be added here in the same PR.
    SELECT * INTO _g FROM public.paige_authority_grants WHERE id = _matches[1];
    _cap := _g.caps;

    -- unenforceable cap kind — same allowlist authority_reserve enforces (20261230000000 L360-372)
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(_cap) AS k(key)
       WHERE k.key NOT IN ('max_per_action_usd','max_per_day','max_per_week','max_per_month',
                           'daily_budget_usd','weekly_budget_usd','monthly_budget_usd')
    ) THEN
      _reason := 'unenforceable_cap_kind';
    -- single-action cap
    ELSIF (_cap ? 'max_per_action_usd') AND _cost > (_cap->>'max_per_action_usd')::numeric THEN
      _reason := 'over_cap';
    ELSE
      -- per-window headroom, read from the shipped capacity view (§10.9 "remaining capacity")
      _used := COALESCE(public.authority_remaining_capacity(_g.id)->'used', '{}'::jsonb);
      IF public.authority_remaining_capacity(_g.id)->>'found' IS DISTINCT FROM 'true' THEN
        _reason := 'capacity_unreadable';
      ELSE
        _reason := 'lifted';   -- provisional; any window breach below flips it back to over_cap
        -- day
        _used_actions := COALESCE((_used->'day'->>'actions_used')::int, 0);
        _used_spend   := COALESCE((_used->'day'->>'spend_used_usd')::numeric, 0);
        IF (_cap ? 'max_per_day')      AND _used_actions + 1 > (_cap->>'max_per_day')::int          THEN _reason := 'over_cap'; END IF;
        IF (_cap ? 'daily_budget_usd') AND _used_spend + _cost > (_cap->>'daily_budget_usd')::numeric THEN _reason := 'over_cap'; END IF;
        -- week
        _used_actions := COALESCE((_used->'week'->>'actions_used')::int, 0);
        _used_spend   := COALESCE((_used->'week'->>'spend_used_usd')::numeric, 0);
        IF (_cap ? 'max_per_week')      AND _used_actions + 1 > (_cap->>'max_per_week')::int           THEN _reason := 'over_cap'; END IF;
        IF (_cap ? 'weekly_budget_usd') AND _used_spend + _cost > (_cap->>'weekly_budget_usd')::numeric THEN _reason := 'over_cap'; END IF;
        -- month
        _used_actions := COALESCE((_used->'month'->>'actions_used')::int, 0);
        _used_spend   := COALESCE((_used->'month'->>'spend_used_usd')::numeric, 0);
        IF (_cap ? 'max_per_month')      AND _used_actions + 1 > (_cap->>'max_per_month')::int           THEN _reason := 'over_cap'; END IF;
        IF (_cap ? 'monthly_budget_usd') AND _used_spend + _cost > (_cap->>'monthly_budget_usd')::numeric THEN _reason := 'over_cap'; END IF;
      END IF;
    END IF;
  END IF;

  -- ── THE LIFT — only when exactly one grant passed every gate. The grant authorizes THIS ACT to run
  -- autonomously, superseding the process's default `confirm` posture (see the §67/§68 header note: the
  -- posture is re-clamped to `confirm` on every step change, so a grant cannot defer to it). The §67/§68
  -- ceiling STILL binds, and an EXPLICIT process `off` (a human kill switch) is never overridden. ──
  IF _reason = 'lifted' THEN
    IF _a.granted_lane = 'off' THEN
      _lifted_rank := 0;                          -- explicit kill switch wins over any grant
    ELSE
      _lifted_rank := LEAST(
        public.autonomy_lane_rank('auto'),        -- the grant authorizes auto for this act...
        public.autonomy_lane_rank(_ceiling));     -- ...bounded only by the §67/§68 ceiling
    END IF;
    _capped_by := CASE
      WHEN _a.granted_lane = 'off' THEN 'process_grant'   -- the human turned this process off
      WHEN _lifted_rank = public.autonomy_lane_rank(_ceiling)
           AND public.autonomy_lane_rank(_ceiling) < public.autonomy_lane_rank('auto') THEN 'ceiling'
      ELSE NULL
    END;
    RETURN jsonb_build_object(
      'found',         true,
      'effective',     public.autonomy_lane_of_rank(_lifted_rank),
      'base_effective', _base_eff,
      'base_floor',    _act_floor,
      'ceiling',       _ceiling,
      'rung',          _rung,
      'granted_lane',  _a.granted_lane,
      'grant_lifted',  (_lifted_rank > _base_rank),
      'grant_id',      _matches[1],
      'capped_by',     _capped_by,
      'reason',        'lifted');
  END IF;

  -- ── FAIL CLOSED — return the base answer, cite why no lift happened. Never `auto` via this path. ──
  _capped_by := CASE
    WHEN _base_rank = public.autonomy_lane_rank(_ceiling)
         AND public.autonomy_lane_rank(_ceiling)
             <= LEAST(public.autonomy_lane_rank(_a.granted_lane), public.autonomy_lane_rank(_act_floor)) THEN 'ceiling'
    WHEN _base_rank = public.autonomy_lane_rank(_act_floor)
         AND public.autonomy_lane_rank(_act_floor) < public.autonomy_lane_rank(_a.granted_lane) THEN 'floor'
    ELSE NULL   -- the human asked for less than everything else allows; nothing is capping them
  END;
  RETURN jsonb_build_object(
    'found',         true,
    'effective',     _base_eff,
    'base_effective', _base_eff,
    'base_floor',    _act_floor,
    'ceiling',       _ceiling,
    'rung',          _rung,
    'granted_lane',  _a.granted_lane,
    'grant_lifted',  false,
    'grant_id',      NULL,
    'capped_by',     _capped_by,
    'reason',        _reason);
END;
$$;

-- Least-privilege (§59). Strip PUBLIC/anon; grant only the trusted headless runtime that PR-3's executor
-- will run as. The body re-asserts §59 scope regardless, so this is lint:definer-fns clean with no anon
-- exemption. No `authenticated` grant in PR-2 — the sole eventual caller is Paige's service-role runtime;
-- an owner-facing read surface (if any) is a PR-3 decision, kept off here to stay maximally dark.
REVOKE ALL ON FUNCTION public.resolve_execution_autonomy(uuid, text, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_execution_autonomy(uuid, text, boolean, numeric) TO service_role;

COMMENT ON FUNCTION public.resolve_execution_autonomy(uuid, text, boolean, numeric) IS
  'RE-2 PR-2 — the policy-aware floor-lift oracle. Per act, returns min(process grant, act floor, Trust Compass ceiling); a single active, in-scope, cap-headroom standing grant (paige_authority_grants) lifts THIS act''s floor to auto — ceiling + process grant still bind. Every other branch fails closed to the base floor and cites reason; a lift cites grant_id (§10.9). SUBSTRATE — no producer yet; the reporting tools still read resolve_automation_autonomy (dark until PR-3).';
