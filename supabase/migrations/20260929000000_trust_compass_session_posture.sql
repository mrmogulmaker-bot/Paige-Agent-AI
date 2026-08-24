-- TRUST COMPASS — the daily posture. A mode you set in the chat, that expires on its own.
--
-- OWNER RULING, 2026-08-24, pointing at Claude Code's own "Select mode" sheet (Auto / Accept
-- edits / Plan): *"It acts as a daily in the Chat the same way these features are set here for
-- you. So we can make this aspect of Trust Compass programmable like this for now for sure."*
--
-- WHAT WAS ALREADY TRUE. `20260928000000` stored the ceiling and gave it two RPCs, and Claude
-- Design's `trustVals` already draws the picker as five named modes with a one-line consequence
-- each — the same shape as that sheet:
--
--     Observe          Reads and reports. Acts on nothing.
--     Draft only       Composes work you review. Never delivers.
--     Ask first        Prepares fully, then waits for your word at the act.
--     Act and report   Acts within scope, tells you afterwards. Reversible acts only.
--     Autonomous       Acts and only raises what needs a decision.
--
-- WHAT WAS MISSING, AND IT IS A SAFETY GAP RATHER THAN A FEATURE GAP. The ceiling is PERMANENT.
-- A mode picker is for a session; ours had no time dimension, so "go autonomous" meant autonomous
-- until somebody remembered to move it back. The thing that makes a daily control safe to touch
-- daily is that it expires by itself.
--
-- SO: A POSTURE. Time-boxed, always expiring, and never above the ceiling.
--
--     effective = LEAST(posture.level, ceiling)   while the posture is unexpired
--     effective = ceiling                          once it lapses
--
-- THE POSTURE CAN ONLY LOWER, NEVER RAISE, and that is the load-bearing decision here. The
-- ceiling is the most this account has ever deliberately agreed to; the daily dial picks WITHIN
-- it. Letting a casual "go autonomous today" exceed the ceiling would turn the quick control into
-- a silent permanent grant — which is the one thing a governance gate cannot afford. It also
-- mirrors the sheet the ruling points at: the casual picker does not hand out the dangerous mode.
-- Raising is still possible and still deliberate: move the ceiling with
-- `set_platform_trust_compass`, which is super_admin-only (§53).
--
-- WHO MAY SET A POSTURE: `is_platform_operator()` — super_admin OR platform_admin. Wider than
-- moving the ceiling ON PURPOSE. A posture can only ever restrain Paige, so a delegated operator
-- should be able to pull the brake without holding God tier. Lowering is a safety act; raising is
-- an authority act, and only the second is frozen at super_admin.
--
-- EXPIRY IS APPLIED ON READ, so no job has to run for a posture to lapse (§64 — nothing here
-- depends on a machine being awake). A lapsed posture is reported as lapsed rather than deleted,
-- so the reader can say "it ran out at 6pm" instead of silently showing the ceiling.
--
-- §18 ONE HOME: this extends the SAME `admin_app_settings` row. No new table, no second store.
-- §59: both new functions are SECURITY DEFINER and both RAISE on the caller check in the BODY.
-- §17: every posture change is audited with what it moved from, exactly as ceiling moves are.

-- ── Read, replaced: now resolves the posture and reports the effective rung ───────────────────
CREATE OR REPLACE FUNCTION public.get_platform_trust_compass()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v         jsonb;
  _ceiling   int;
  _posture   jsonb;
  _level     int;
  _until     timestamptz;
  _live      boolean := false;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _v FROM public.admin_app_settings WHERE key = 'paige_trust_compass';

  -- No row is a real answer, not a default to invent: the caller renders no meter rather than
  -- a rung the platform is not actually holding (§13).
  IF _v IS NULL THEN
    RETURN NULL;
  END IF;

  _ceiling := COALESCE((_v->>'ceiling')::int, 2);
  _posture := _v->'posture';

  IF _posture IS NOT NULL AND jsonb_typeof(_posture) = 'object' THEN
    _level := (_posture->>'level')::int;
    _until := (_posture->>'until')::timestamptz;
    -- A posture with no expiry cannot exist by construction (see the setter), so a NULL `until`
    -- here is corrupt data and is treated as lapsed rather than as forever.
    _live  := _level IS NOT NULL AND _until IS NOT NULL AND _until > now();
  END IF;

  RETURN jsonb_build_object(
    'ceiling', _ceiling,
    'away',    COALESCE(_v->>'away', 'hold'),
    'domains', COALESCE(_v->'domains', '{}'::jsonb),
    -- The posture is reported whether or not it is live, with `active` saying which — so the
    -- chat can say "it ran out at 18:00" instead of quietly showing the ceiling again (§13).
    'posture', CASE WHEN _posture IS NULL OR jsonb_typeof(_posture) <> 'object' THEN NULL
                    ELSE _posture || jsonb_build_object('active', _live) END,
    -- What actually binds Paige right now. Every caller clamps against THIS, not the ceiling.
    'effective', CASE WHEN _live THEN LEAST(_level, _ceiling) ELSE _ceiling END
  );
END;
$$;

-- ── Set a posture ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_trust_posture(
  _level  int,
  _hours  int  DEFAULT 24,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev    jsonb;
  _ceiling int;
  _until   timestamptz;
  _next    jsonb;
BEGIN
  -- Wider than the ceiling setter, deliberately: a posture only ever restrains her, so a
  -- delegated operator may pull the brake without holding God tier (§53).
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_POSTURE_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  IF _level IS NULL OR _level < 0 OR _level > 4 THEN
    RAISE EXCEPTION 'TRUST_POSTURE_RANGE: level must be 0..4, got %', _level
      USING ERRCODE = '22023';
  END IF;

  -- A posture ALWAYS expires. That is what makes it safe to set casually, and it is why there is
  -- no "until I clear it" option — that option is the ceiling, and moving it is a deliberate act.
  IF _hours IS NULL OR _hours < 1 OR _hours > 168 THEN
    RAISE EXCEPTION 'TRUST_POSTURE_RANGE: hours must be 1..168 (a week), got %', _hours
      USING ERRCODE = '22023';
  END IF;

  SELECT value INTO _prev FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  _prev := COALESCE(_prev, '{"ceiling": 2, "away": "hold", "domains": {}}'::jsonb);
  _ceiling := COALESCE((_prev->>'ceiling')::int, 2);

  -- THE INVARIANT. Refused loudly, and the message says where to go instead — a governance
  -- refusal that does not name the deliberate path just reads as a broken control.
  IF _level > _ceiling THEN
    RAISE EXCEPTION
      'TRUST_POSTURE_ABOVE_CEILING: a posture may not exceed the ceiling (asked %, ceiling %). Raising what she may do is a deliberate act — move the ceiling instead.',
      _level, _ceiling
      USING ERRCODE = '42501';
  END IF;

  _until := now() + make_interval(hours => _hours);

  _next := _prev || jsonb_build_object('posture', jsonb_build_object(
    'level',  _level,
    'until',  _until,
    'reason', _reason,
    'set_by', auth.uid(),
    'set_at', now()
  ));

  INSERT INTO public.admin_app_settings (key, value, updated_by, updated_at)
  VALUES ('paige_trust_compass', _next, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, payload)
  VALUES (
    auth.uid(),
    'platform_operator',
    'platform.trust_posture.set',
    'admin_app_settings',
    jsonb_build_object('previous', _prev->'posture', 'next', _next->'posture', 'ceiling', _ceiling)
  );

  RETURN public.get_platform_trust_compass();
END;
$$;

-- ── Clear it early ───────────────────────────────────────────────────────────────────────────
-- A posture lapses on its own, but "I'm back, drop it" has to be one act rather than waiting.
CREATE OR REPLACE FUNCTION public.clear_trust_posture()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev jsonb;
  _next jsonb;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_POSTURE_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _prev FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  IF _prev IS NULL THEN
    RETURN public.get_platform_trust_compass();
  END IF;

  _next := _prev - 'posture';

  INSERT INTO public.admin_app_settings (key, value, updated_by, updated_at)
  VALUES ('paige_trust_compass', _next, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  -- Clearing is a movement too, and an audit trail with only one direction in it is not one.
  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, payload)
  VALUES (
    auth.uid(),
    'platform_operator',
    'platform.trust_posture.cleared',
    'admin_app_settings',
    jsonb_build_object('previous', _prev->'posture')
  );

  RETURN public.get_platform_trust_compass();
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────────────────────
-- Same posture as the ceiling functions: no anon, no PUBLIC. The body is the guard (§59); these
-- REVOKEs exist so the grant is never mistaken for one.
REVOKE ALL ON FUNCTION public.set_trust_posture(int, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_trust_posture() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_trust_posture(int, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clear_trust_posture() TO authenticated, service_role;

COMMENT ON FUNCTION public.set_trust_posture(int, int, text) IS
  'Trust Compass daily posture: a time-boxed rung at or BELOW the ceiling. Always expires (1..168h). Never raises — raising is set_platform_trust_compass, super_admin only.';
COMMENT ON FUNCTION public.clear_trust_posture() IS
  'Drops the daily posture early. The effective rung returns to the ceiling.';
