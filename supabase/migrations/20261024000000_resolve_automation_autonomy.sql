-- §67 SLICE B — THE RESOLVER. One place that answers "how much of this may run on its own?"
--
-- Slice A gave a process a GRANT. This turns that grant into an ANSWER, by applying the two bounds
-- that already exist, in the order the architecture doc fixes:
--
--     effective = min( the grant the human gave this process,
--                      the most restrictive act's own floor,
--                      the Trust Compass ceiling )
--
-- That arithmetic is the design pack's, and it is reproduced here rather than re-derived, because
-- re-deriving it is re-deciding it. What this migration adds is the SQL, the act-floor half that
-- had no implementation, and the honesty about what the answer does not cover.
--
-- ONE HOME (§18). The runtime clamp calls this, a surface renders it, and Paige reads it before she
-- acts — all three from the same function, so they cannot disagree. Every existing piece is reused
-- rather than reimplemented: `trust_effective_rung()` is the ceiling (20261021000000),
-- `resolve_tool_autonomy` is the per-tool floor (its catalogue completed in 20261020000000), and
-- `paige_action_kinds` carries the action-bus floor. Nothing here invents a fourth vocabulary.
--
-- WHY `capped_by` IS RETURNED AND NOT JUST `effective`. A clamp nobody can see is indistinguishable
-- from a bug. When a person set a process to run on its own and it is asking anyway, the useful
-- answer is not "confirm" — it is "confirm, because the platform's ceiling is holding you there",
-- or "because one of your acts sends something and sending always asks". §68 already requires the
-- read to publish requested, effective and the reason together; this does the same for a process.
--
-- WHY `dark` IS SEPARATE FROM `effective`. They answer different questions. `effective` is what
-- Paige MAY do; `dark` is whether the occasion will ever arise. A process can be perfectly
-- permitted and still never fire because nothing emits its trigger, and collapsing the two would
-- report that as a permission problem and send someone to fix the wrong thing.

-- Lane ordering, so "most restrictive" is arithmetic rather than a chain of CASEs repeated at every
-- call site. off(0) < confirm(1) < auto(2).
CREATE OR REPLACE FUNCTION public.autonomy_lane_rank(_lane text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _lane WHEN 'auto' THEN 2 WHEN 'confirm' THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.autonomy_lane_of_rank(_rank int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _rank >= 2 THEN 'auto' WHEN _rank = 1 THEN 'confirm' ELSE 'off' END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_automation_autonomy(_automation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _a           record;
  _rung        int;
  _ceiling     text;
  _floor       text := 'auto';   -- the identity for a min: no acts constrains nothing
  _floor_by    text;
  _act         record;
  _act_floor   text;
  _dark        jsonb := '[]'::jsonb;
  _trigger     record;
  _eff_rank    int;
  _capped_by   text;
BEGIN
  -- §9 — THE CALLER MUST BE ABLE TO SEE THIS PROCESS. SECURITY DEFINER changes the ROLE, not
  -- `auth.uid()`, so RLS on `paige_automations` does NOT apply inside this body and the check has
  -- to be made explicitly. Without it, any authenticated caller could read another tenant's
  -- automation posture by guessing a uuid — the exact DEFINER leak class §59 exists to stop.
  SELECT * INTO _a FROM public.paige_automations WHERE id = _automation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  -- A NULL `auth.uid()` is the SERVICE ROLE, not an anonymous stranger: PostgREST never reaches
  -- this without a JWT, so the only caller with no subject is our own trusted server-side code —
  -- Paige's headless runtime, which is the main consumer of this answer. `resolve_tool_autonomy`
  -- already draws the line here for the same reason, and drawing it differently would mean the
  -- runtime clamp could never read the posture it is supposed to enforce.
  --
  -- The §32 proof caught this: with the membership check applied unconditionally, EVERY case
  -- returned `found:false`, because a proof session has no JWT either. A resolver the runtime
  -- cannot call is not a safer resolver, it is an unused one — and an unused clamp is how a
  -- process ends up governed by nothing.
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_platform_owner() OR public.is_tenant_member(_a.tenant_id)) THEN
    -- Same shape as "not found", deliberately: telling a stranger that a process EXISTS but is not
    -- theirs is itself a disclosure.
    RETURN jsonb_build_object('found', false);
  END IF;

  -- ── THE CEILING ──
  _rung := public.trust_effective_rung();
  _ceiling := CASE WHEN _rung <= 0 THEN 'off' WHEN _rung <= 1 THEN 'confirm' ELSE 'auto' END;

  -- ── THE FLOOR: the MOST RESTRICTIVE act in the chain ──
  -- A chain is only as autonomous as its least autonomous step. One act that must be approved makes
  -- the whole process ask, because running half of it unattended and then stopping is not what
  -- anyone granted.
  FOR _act IN SELECT * FROM public.paige_automation_acts WHERE automation_id = _automation_id LOOP
    IF _act.action_kind IS NOT NULL THEN
      SELECT
        CASE
          -- The action bus's own law, read rather than restated: anything that goes out through
          -- approval carries approval, whatever a lane column says.
          WHEN k.requires_approval THEN 'confirm'
          ELSE COALESCE(k.default_autonomy_lane, 'confirm')
        END
      INTO _act_floor
      FROM public.paige_action_kinds k WHERE k.slug = _act.action_kind;
      _act_floor := COALESCE(_act_floor, 'confirm');
    ELSE
      -- The per-tool gate, which already applies the tenant's own setting AND the ceiling. Calling
      -- it here means a tool a tenant switched off cannot be smuggled into an automation and run
      -- anyway — the floor is the same object whether Paige is asked in chat or by a process.
      _act_floor := public.resolve_tool_autonomy(_a.tenant_id, _act.tool_key);
    END IF;

    IF public.autonomy_lane_rank(_act_floor) < public.autonomy_lane_rank(_floor) THEN
      _floor := _act_floor;
      _floor_by := COALESCE(_act.action_kind, _act.tool_key);
    END IF;
  END LOOP;

  -- ── WHETHER IT CAN FIRE AT ALL ──
  SELECT * INTO _trigger FROM public.paige_automation_triggers WHERE key = _a.trigger_key;
  IF FOUND AND NOT _trigger.is_live THEN
    _dark := _dark || jsonb_build_array(jsonb_build_object(
      'kind', 'trigger', 'key', _a.trigger_key, 'reason', _trigger.dark_reason));
  END IF;
  -- A process with no acts does nothing when it fires. Not a permission fact, so it belongs here
  -- next to the trigger rather than in the arithmetic.
  IF NOT EXISTS (SELECT 1 FROM public.paige_automation_acts WHERE automation_id = _automation_id) THEN
    _dark := _dark || jsonb_build_array(jsonb_build_object(
      'kind', 'acts', 'reason', 'This has no steps yet, so there is nothing for it to do when it runs.'));
  END IF;

  -- ── THE ARITHMETIC ──
  _eff_rank := LEAST(
    public.autonomy_lane_rank(_a.granted_lane),
    public.autonomy_lane_rank(_floor),
    public.autonomy_lane_rank(_ceiling));

  -- WHICH bound is holding it. Ordered most-explanatory-first: if the human already asked for less
  -- than everything else allows, the honest answer is that nothing is capping them — they chose it.
  _capped_by := CASE
    WHEN _eff_rank = public.autonomy_lane_rank(_a.granted_lane)
         AND public.autonomy_lane_rank(_a.granted_lane)
             <= LEAST(public.autonomy_lane_rank(_floor), public.autonomy_lane_rank(_ceiling))
      THEN NULL
    WHEN _eff_rank = public.autonomy_lane_rank(_ceiling) THEN 'ceiling'
    ELSE 'floor'
  END;

  RETURN jsonb_build_object(
    'found',     true,
    'state',     _a.state,
    'granted',   _a.granted_lane,
    'floor',     _floor,
    'floor_act', _floor_by,
    'ceiling',   _ceiling,
    'rung',      _rung,
    'effective', public.autonomy_lane_of_rank(_eff_rank),
    'capped_by', _capped_by,
    -- `would_run` is the whole question a person is actually asking, and it is deliberately NOT
    -- just `effective = auto`: a permitted process that nothing can trigger still never runs.
    'would_run', (_a.state = 'live' AND jsonb_array_length(_dark) = 0),
    'dark',      _dark);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_automation_autonomy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_automation_autonomy(uuid) TO authenticated, service_role;
-- The two lane helpers are pure arithmetic over a three-value enum. They read nothing, so they
-- are left executable: revoking them would only force every caller to restate the ordering,
-- which is how the ordering drifts.

COMMENT ON FUNCTION public.resolve_automation_autonomy(uuid) IS
  '§67 — the one home for "how much of this process may run on its own?". effective = min(grant, most restrictive act floor, Trust Compass ceiling), with capped_by naming which bound is holding it and dark listing the reasons it could never fire regardless. Membership is checked in-body because SECURITY DEFINER bypasses RLS (§59).';

-- ── §32 PROOF — driven against production Postgres inside BEGIN..ROLLBACK, 2026-08-31 ──
--
-- Eleven cases, all passing. Fixtures come from the REAL action bus, not from invented rows:
-- `client.followup` is an approval-bearing kind and `client.at_risk` an auto one, both selected by
-- querying `paige_action_kinds` rather than asserted.
--
--   B0  fixtures resolved from the real action bus ........ client.followup / client.at_risk
--   B1  a process with no steps is dark and would not run . would_run false, dark kind `acts`
--   B2  one approval-bearing act makes the WHOLE chain ask  confirm, capped_by floor
--   B3  NEGATIVE CONTROL — drop that act, floor releases ... auto
--   B4  the CEILING holds the same process at rung 1 ...... confirm, capped_by ceiling
--   B5  …and at rung 0 nothing acts unread at all ......... off, capped_by ceiling
--   B6  NEGATIVE CONTROL — raise the rung, the cap lifts .. auto, capped_by none
--   B7  a human who asked for LESS is not being capped .... off, capped_by NULL
--   B8  permitted but dark still would not run ............ auto / would_run false
--   B9  a draft would not run however it is granted ....... would_run false
--   B10 §59: a JWT non-member gets found:false ............ false
--
-- EACH BOUND IS SHOWN TO ACT INDEPENDENTLY, AND EACH HAS A CONTROL. B2/B3 are the same process
-- with and without one act; B4/B5/B6 are the same process at three rungs. Without the controls,
-- "confirm" could equally be a constant, and the arithmetic would be untested by a green result.
--
-- ONE SEAM IS A DOUBLE, NAMED HONESTLY: `trust_effective_rung()` was replaced for the run so every
-- rung could be driven, since the real one reads the single live compass value. Everything else —
-- `paige_action_kinds`, `resolve_tool_autonomy`, `is_tenant_member`, the arithmetic — is the
-- shipped object.
--
-- THE SERVICE-ROLE PATH EXISTS BECAUSE THE PROOF FOUND IT MISSING. With the membership check
-- applied unconditionally, all ten arithmetic cases returned `found:false` — a proof session has no
-- JWT, and neither does Paige's headless runtime, which is this function's main caller. A resolver
-- the runtime cannot call is not a stricter resolver, it is an unused one. B10 confirms opening
-- that path did not widen the JWT case: a signed-in non-member still learns nothing.
