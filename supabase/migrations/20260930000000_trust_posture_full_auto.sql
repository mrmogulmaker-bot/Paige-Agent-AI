-- TRUST COMPASS — full auto. The posture may now RAISE, and the direction decides the authority.
--
-- OWNER RULING, 2026-08-24: *"Yes we should have the ability to go full auto."* — answering the
-- question left open by `20260929000000`, which refused any posture above the ceiling.
--
-- WHAT CHANGES, AND WHY THIS IS SAFER THAN THE OBVIOUS ALTERNATIVE. The alternative way to reach
-- full auto was already available: move the CEILING to 4. That is worse, and the reason is the
-- reason the posture exists at all — a ceiling is permanent, so "set it to 4 for this afternoon"
-- becomes 4 forever until somebody remembers. A raising POSTURE expires by itself. So the honest
-- design is not "loosen the invariant" but "let the temporary control be the one that goes high,
-- and keep the permanent one deliberate."
--
-- THE DIRECTION DECIDES THE AUTHORITY. This is the whole rule:
--
--     LOWERING  (posture <= ceiling)   is_platform_operator()   — super_admin OR platform_admin
--     RAISING   (posture >  ceiling)   is_platform_owner()      — super_admin only
--
-- Restraining her is a safety act and a delegated operator may do it without God tier. Widening
-- what she may do is an authority act, and §53 freezes that class at super_admin whether it lasts
-- an hour or forever. `set_platform_trust_compass` was already super_admin-only for exactly this
-- reason; a raising posture is the same act with a shorter life, so it carries the same gate.
--
-- A RAISE IS SHORTER BY DEFAULT. An unattended full-auto window is the most expensive and least
-- reversible state this platform has, so a raising posture defaults to 4 hours rather than 24 and
-- caps at 24 rather than a week. Lowering keeps the original 24h default and 168h cap — being
-- careful for a week is fine; being unattended for a week is not.
--
-- IT IS MARKED IN THE AUDIT. Every raise writes `raised_above_ceiling: true` with the ceiling it
-- passed, so "when did she run above the agreed ceiling, and who said so" is one query rather
-- than a reconstruction (§17).
--
-- WHAT THIS DOES NOT DO, STATED PLAINLY (§13). It does not meter or cap the SPEND that full auto
-- produces. Measured on prod the same day: 639 LLM calls traced, $1.38 of estimated cost, and
-- ZERO rows ever written to `platform_metered_events`. Paige's token spend is observable and is
-- not billable, and no plan carries an AI allowance — `platform_subscription_plans` has
-- `included_seats` and `included_contacts` and nothing for usage. Full auto changes the VOLUME of
-- that spend, not the unit cost, and it removes the human who was implicitly rate-limiting it.
-- The metering work is tracked separately and named in `docs/doctrine/autonomy-architecture.md`;
-- this migration deliberately does not pretend to solve it.

CREATE OR REPLACE FUNCTION public.set_trust_posture(
  _level  int,
  _hours  int  DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev     jsonb;
  _ceiling  int;
  _raising  boolean;
  _max_h    int;
  _hrs      int;
  _until    timestamptz;
  _next     jsonb;
BEGIN
  IF _level IS NULL OR _level < 0 OR _level > 4 THEN
    RAISE EXCEPTION 'TRUST_POSTURE_RANGE: level must be 0..4, got %', _level
      USING ERRCODE = '22023';
  END IF;

  SELECT value INTO _prev FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  _prev := COALESCE(_prev, '{"ceiling": 2, "away": "hold", "domains": {}}'::jsonb);
  _ceiling := COALESCE((_prev->>'ceiling')::int, 2);
  _raising := _level > _ceiling;

  -- THE GATE, chosen by direction rather than by rung. Checked BEFORE anything is written, and in
  -- the body rather than by the grant (§59).
  IF _raising THEN
    IF NOT public.is_platform_owner() THEN
      RAISE EXCEPTION
        'TRUST_POSTURE_FORBIDDEN: raising above the ceiling (asked %, ceiling %) is super_admin only. A platform_admin may lower the posture, never widen it.',
        _level, _ceiling
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_POSTURE_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  -- A raise is the most expensive state the platform has, so it is shorter by default and capped
  -- harder. Both still ALWAYS expire — that has not changed and is the point of a posture.
  _max_h := CASE WHEN _raising THEN 24 ELSE 168 END;
  _hrs   := COALESCE(_hours, CASE WHEN _raising THEN 4 ELSE 24 END);

  IF _hrs < 1 OR _hrs > _max_h THEN
    RAISE EXCEPTION
      'TRUST_POSTURE_RANGE: hours must be 1..% for a % posture, got %',
      _max_h, CASE WHEN _raising THEN 'raising' ELSE 'lowering' END, _hrs
      USING ERRCODE = '22023';
  END IF;

  _until := now() + make_interval(hours => _hrs);

  _next := _prev || jsonb_build_object('posture', jsonb_build_object(
    'level',   _level,
    'until',   _until,
    'reason',  _reason,
    'set_by',  auth.uid(),
    'set_at',  now(),
    -- Carried on the record itself so a reader can say "she is running ABOVE your standing
    -- ceiling until 18:00" rather than just showing a number (§13).
    'above_ceiling', _raising,
    'ceiling_at_set', _ceiling
  ));

  INSERT INTO public.admin_app_settings (key, value, updated_by, updated_at)
  VALUES ('paige_trust_compass', _next, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, payload)
  VALUES (
    auth.uid(),
    CASE WHEN _raising THEN 'super_admin' ELSE 'platform_operator' END,
    -- A distinct action name, so every unattended window is one grep rather than a reconstruction.
    CASE WHEN _raising THEN 'platform.trust_posture.raised' ELSE 'platform.trust_posture.set' END,
    'admin_app_settings',
    jsonb_build_object(
      'previous', _prev->'posture',
      'next', _next->'posture',
      'ceiling', _ceiling,
      'raised_above_ceiling', _raising,
      'hours', _hrs
    )
  );

  RETURN public.get_platform_trust_compass();
END;
$$;

-- ── The read has to stop clamping ────────────────────────────────────────────────────────────
-- `20260929000000` computed `LEAST(posture, ceiling)`, which was correct while a posture could
-- only lower and is now WRONG: it would silently discard the raise the owner just authorised. The
-- posture is the answer while it is live, whichever side of the ceiling it sits on.
CREATE OR REPLACE FUNCTION public.get_platform_trust_compass()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v jsonb; _ceiling int; _posture jsonb; _level int; _until timestamptz; _live boolean := false;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _v FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  IF _v IS NULL THEN RETURN NULL; END IF;

  _ceiling := COALESCE((_v->>'ceiling')::int, 2);
  _posture := _v->'posture';

  IF _posture IS NOT NULL AND jsonb_typeof(_posture) = 'object' THEN
    _level := (_posture->>'level')::int;
    _until := (_posture->>'until')::timestamptz;
    _live  := _level IS NOT NULL AND _until IS NOT NULL AND _until > now();
  END IF;

  RETURN jsonb_build_object(
    'ceiling', _ceiling,
    'away',    COALESCE(_v->>'away', 'hold'),
    'domains', COALESCE(_v->'domains', '{}'::jsonb),
    'posture', CASE WHEN _posture IS NULL OR jsonb_typeof(_posture) <> 'object' THEN NULL
                    ELSE _posture || jsonb_build_object('active', _live) END,
    -- The live posture IS the answer — no LEAST. A raise that the read clamped away would be a
    -- control that appears to have taken a setting the platform then ignored (§13).
    'effective', CASE WHEN _live THEN _level ELSE _ceiling END,
    -- So a reader never has to re-derive it from two numbers.
    'above_ceiling', _live AND _level > _ceiling
  );
END;
$$;

COMMENT ON FUNCTION public.set_trust_posture(int, int, text) IS
  'Trust Compass daily posture. Lowering (<= ceiling) is is_platform_operator(), default 24h, max 168h. RAISING (> ceiling) is is_platform_owner() only, default 4h, max 24h, audited as platform.trust_posture.raised. Always expires.';
