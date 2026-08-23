-- PLATFORM TRUST COMPASS — the ceiling, stored, so the chat strip is a real control.
--
-- WHY THIS EXISTS. Claude Design's v3 spine puts the Trust Compass INSIDE the chat: the five
-- bars above the transcript are the control, and "Full panel" opens the rest. Owner, 2026-08-23:
-- "This is where the actual control of Trust Compass and everything lives inside of the chat.
-- We have compressed a lot of things because we don't need those things to have their own
-- dedicated areas any longer."
--
-- The strip could not render, because the RUNG had nowhere to live. A ceiling is a governance
-- gate — every capability's effective grant is `min(its own grant, the ceiling)` — so a
-- plausible-looking rung would tell the operator a gate is set where it is not (§13). This
-- migration gives the rung a real home and leaves the rest of the compass reading from records
-- that already exist.
--
-- §18 ONE HOME, NO NEW TABLE. `admin_app_settings` is the platform's config-as-data store and is
-- already `is_platform_owner()`-gated on read and write. The compass is one row in it, not a
-- fifth settings table.
--
-- §10 CALLABLE SEAM. Both directions are RPCs, so Paige can read and move the ceiling from the
-- chat by voice or text without a human in the UI — which is the whole point of putting the
-- control in the transcript.
--
-- §53 WHO MAY MOVE IT. Reading is `is_platform_operator()` (super_admin OR platform_admin — a
-- delegated operator must be able to SEE the ceiling that clamps their work). Writing is
-- `is_platform_owner()` (super_admin only): raising the ceiling raises what Paige may do across
-- every tenant, which is exactly the class of integrity action §53 freezes at God tier.
--
-- §59 THE GRANT IS NEVER THE GUARD. Both functions are SECURITY DEFINER — they must be, to read
-- and write a table whose RLS is owner-only — so both RAISE on the caller check in the BODY
-- before touching a row. The EXECUTE grant is not the access control.

-- ── The row ──────────────────────────────────────────────────────────────────────────────────
-- `ceiling` is the trust scale, 0..4: 0 Observe · 1 Draft only · 2 Ask first · 3 Act and report
-- · 4 Autonomous. 2 is the seeded default, which is the pack's own default AND the lane the §16
-- action registry already runs on (`confirm`) — the seed states what is already true rather than
-- changing platform behaviour.
-- `away` is the absence rule: hold | reversible | ceiling.
-- `domains` is per-domain, each at or BELOW the ceiling; an absent key means "at the ceiling",
-- so an empty object is a complete, honest answer rather than a missing one.
INSERT INTO public.admin_app_settings (key, value)
VALUES ('paige_trust_compass', '{"ceiling": 2, "away": "hold", "domains": {}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Read ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_trust_compass()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v jsonb;
BEGIN
  -- §59: the body enforces the caller, not the grant.
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

  RETURN jsonb_build_object(
    'ceiling', COALESCE((_v->>'ceiling')::int, 2),
    'away',    COALESCE(_v->>'away', 'hold'),
    'domains', COALESCE(_v->'domains', '{}'::jsonb)
  );
END;
$$;

-- ── Write ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_platform_trust_compass(
  _ceiling int DEFAULT NULL,
  _away    text DEFAULT NULL,
  _domains jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prev jsonb;
  _next jsonb;
  _dom  jsonb;
  _k    text;
  _dv   int;
  _c    int;
BEGIN
  -- §53: moving the ceiling is a God-tier integrity action. platform_admin may read it, never
  -- raise it.
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: super_admin required to move the ceiling'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _prev FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  _prev := COALESCE(_prev, '{"ceiling": 2, "away": "hold", "domains": {}}'::jsonb);

  _c := COALESCE(_ceiling, (_prev->>'ceiling')::int, 2);
  IF _c < 0 OR _c > 4 THEN
    RAISE EXCEPTION 'TRUST_COMPASS_RANGE: ceiling must be 0..4, got %', _c
      USING ERRCODE = '22023';
  END IF;

  IF _away IS NOT NULL AND _away NOT IN ('hold', 'reversible', 'ceiling') THEN
    RAISE EXCEPTION 'TRUST_COMPASS_RANGE: away must be hold|reversible|ceiling, got %', _away
      USING ERRCODE = '22023';
  END IF;

  _dom := COALESCE(_domains, _prev->'domains', '{}'::jsonb);

  -- A domain may sit AT or BELOW the ceiling and never above it — that is what makes this a
  -- ceiling rather than a switch. Lowering the dial lowers every domain with it, which is the
  -- behaviour the panel's own effect line describes.
  FOR _k IN SELECT jsonb_object_keys(_dom) LOOP
    _dv := (_dom->>_k)::int;
    IF _dv < 0 OR _dv > 4 THEN
      RAISE EXCEPTION 'TRUST_COMPASS_RANGE: domain % must be 0..4, got %', _k, _dv
        USING ERRCODE = '22023';
    END IF;
    IF _dv > _c THEN
      _dom := jsonb_set(_dom, ARRAY[_k], to_jsonb(_c));
    END IF;
  END LOOP;

  _next := jsonb_build_object(
    'ceiling', _c,
    'away',    COALESCE(_away, _prev->>'away', 'hold'),
    'domains', _dom
  );

  INSERT INTO public.admin_app_settings (key, value, updated_by, updated_at)
  VALUES ('paige_trust_compass', _next, auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

  -- A movement is only auditable if the row says what it moved FROM (§17 governance).
  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, payload)
  VALUES (
    auth.uid(),
    'super_admin',
    'platform.trust_compass.set',
    'admin_app_settings',
    jsonb_build_object('previous', _prev, 'next', _next)
  );

  RETURN _next;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────────────────────
-- Neither function is a public read: anon has no business knowing the platform's autonomy
-- ceiling, and the in-body gates would refuse it anyway.
REVOKE ALL ON FUNCTION public.get_platform_trust_compass() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_platform_trust_compass(int, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_trust_compass() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_platform_trust_compass(int, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_platform_trust_compass() IS
  'Platform Trust Compass ceiling (0..4), absence rule and per-domain rungs. Operator-scope read; NULL when unset.';
COMMENT ON FUNCTION public.set_platform_trust_compass(int, text, jsonb) IS
  'Moves the platform Trust Compass. super_admin only (§53); clamps domains to the ceiling and audits the movement.';
