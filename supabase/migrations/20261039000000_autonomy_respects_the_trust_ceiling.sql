-- S4 — the Trust Compass actually clamps what Paige may do unattended.
--
-- §67: "Effective autonomy is min(grant, most-restrictive act's floor, ceiling)."
--
-- THE CEILING WAS NOT IN THAT ARITHMETIC ANYWHERE ON THE SERVER. `resolve_tool_autonomy` — the one
-- function every write in `paige-ai-chat` consults before acting — reads `tenant_tool_autonomy` and
-- returns its mode. It has never read the compass. A grep across every edge function for
-- `get_platform_trust_compass|paige_trust_compass|trust_compass` returns exactly two hits, and both
-- are REFUSAL STRINGS in workflow dispatchers naming it as a MISSING contract
-- (`missing_contracts: [..., "trust_compass_autonomy_consult"]`). The platform's own code said the
-- consult did not exist.
--
-- So the compass was a number that was stored, displayed on an operator surface, audited when
-- changed, expired on a schedule, and enforced nowhere. An operator lowering the platform to rung 0
-- — "nothing acts unread" — changed what the Fleet Console displayed and changed nothing about what
-- Paige did next. The only clamp that existed was `clampMode()` in the browser, applied on one
-- operator settings screen, which cannot bind a server-side tool loop.
--
-- WHY THE COMPUTATION MOVES RATHER THAN BEING COPIED. The effective rung is not the stored ceiling:
-- it is the requested rung (ceiling, or a live posture that may sit above it) walked DOWN to the
-- highest rung whose attestation window is still in date and whose required safety proofs are
-- actually passing (§68). Re-deriving that in a second place would give two answers that drift, and
-- the one nobody looks at would be the one enforcing. It moves into `trust_effective_rung()`, and
-- `get_platform_trust_compass()` calls it — so the number the operator READS and the number that
-- BINDS are the same number by construction.
--
-- The internal function is REVOKEd from everyone. It is reachable only from other SECURITY DEFINER
-- functions, so a tenant caller never learns the platform's posture; they only ever see its effect
-- on their own tool's mode.
--
-- §37 CONSUMERS of `resolve_tool_autonomy`: two — `paige-ai-chat` (the gate) and
-- `studio-learn-from-artifact`. Both consume a mode string and are unaffected by where the string
-- came from. `paige-mcp` does NOT consult it (a separate, still-ungoverned write path, named here
-- so this change is not mistaken for covering it).
--
-- §51 per tier: the clamp is a PLATFORM ceiling, so it applies to every tenant tier identically and
-- cannot be raised by a tenant. God's own turns are clamped too — deliberately: an operator who
-- lowers the platform lowers it for themselves, which is what makes the control trustworthy.

-- ── 0. The safety-proof READING, without the operator gate. ──
--
-- §13 — THIS FUNCTION WAS NOT IN THE FIRST DRAFT OF THIS MIGRATION, AND ITS ABSENCE WOULD HAVE
-- BROKEN EVERY TENANT'S TOOL LOOP. `trust_effective_rung()` needs the safety-proof statuses, and
-- `platform_safety_proof()` — the only reader of them — RAISES `TRUST_COMPASS_FORBIDDEN` for any
-- caller who is not a platform operator. SECURITY DEFINER changes the ROLE, not `auth.uid()`, so a
-- nested call from a tenant's turn still fails that gate: the clamp would have raised inside
-- `resolve_tool_autonomy` on every ordinary write, and the tool loop swallows that into a default.
-- Caught by driving the proof on production Postgres before shipping, not by reading it.
--
-- The reading moves here, ungated and revoked from every role; `platform_safety_proof()` keeps the
-- operator gate and now just wraps this, so the operator display and the enforcement path read the
-- same rows. Statuses are not secrets to the tenant either way — the tenant never sees them, only
-- their effect on their own tool's mode.
CREATE OR REPLACE FUNCTION public.platform_safety_proof_internal()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _out jsonb;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (f.check_id)
           f.check_id, f.status, f.created_at, f.evidence
    FROM public.paige_systems_check_finding f
    JOIN public.paige_systems_check_registry reg ON reg.check_id = f.check_id
    WHERE reg.scope = 'operator' AND f.tenant_id IS NULL
    ORDER BY f.check_id, f.created_at DESC
  )
  SELECT jsonb_object_agg(
           g.check_id,
           jsonb_build_object(
             'status',   COALESCE(l.status, 'never_run'),
             'at',       l.created_at,
             'fresh',    l.created_at IS NOT NULL AND l.created_at > now() - interval '25 hours',
             'reason',   l.evidence->>'reason'
           )
         )
    INTO _out
    FROM (VALUES
            ('operator_cross_tenant_canary'),
            ('operator_rls_coverage')
         ) AS g(check_id)
    LEFT JOIN latest l ON l.check_id = g.check_id;

  RETURN COALESCE(_out, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_safety_proof_internal() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.platform_safety_proof_internal() IS
  'Ungated reading of the §68 safety-loop statuses. Internal: revoked from every role, reachable only from other SECURITY DEFINER functions. `platform_safety_proof()` keeps the operator gate and wraps this, so the operator display and the autonomy clamp read the same rows.';

-- The operator-facing reader keeps its gate and delegates, so there is one query and not two.
CREATE OR REPLACE FUNCTION public.platform_safety_proof()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.platform_safety_proof_internal();
END;
$$;

-- ── 1. The effective rung, without the operator gate. ──
CREATE OR REPLACE FUNCTION public.trust_effective_rung()
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v jsonb; _ceiling int; _posture jsonb; _level int; _until timestamptz; _live boolean := false;
  _requested int; _granted int; _attested timestamptz; _proof jsonb; _win interval;
  _r int; _ok boolean; _need text[]; _c text;
BEGIN
  SELECT value INTO _v FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  -- NO ROW IS NOT "NO LIMIT". An absent compass means nobody has set one, and the safe reading of
  -- "nobody has said how much Paige may do unattended" is the default the rest of this system
  -- already uses: propose and wait. Returning a high rung here would make deleting the row a way to
  -- unlock full autonomy.
  IF _v IS NULL THEN RETURN 1; END IF;

  _ceiling  := COALESCE((_v->>'ceiling')::int, 2);
  _posture  := _v->'posture';
  _attested := (_v->>'attested_at')::timestamptz;

  IF _posture IS NOT NULL AND jsonb_typeof(_posture) = 'object' THEN
    _level := (_posture->>'level')::int;
    _until := (_posture->>'until')::timestamptz;
    _live  := _level IS NOT NULL AND _until IS NOT NULL AND _until > now();
  END IF;

  _requested := CASE WHEN _live THEN _level ELSE _ceiling END;
  _proof     := public.platform_safety_proof_internal();

  _granted := 0;
  FOR _r IN REVERSE _requested..0 LOOP
    _ok  := true;
    _win := public.trust_attestation_window(_r);
    IF _win IS NOT NULL AND (_attested IS NULL OR _attested + _win < now()) THEN _ok := false; END IF;
    IF _ok THEN
      _need := public.trust_required_proof(_r);
      FOREACH _c IN ARRAY _need LOOP
        IF COALESCE(_proof->_c->>'status', 'never_run') <> 'pass' THEN _ok := false; EXIT; END IF;
      END LOOP;
    END IF;
    IF _ok THEN _granted := _r; EXIT; END IF;
  END LOOP;

  RETURN _granted;
END;
$$;

REVOKE ALL ON FUNCTION public.trust_effective_rung() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.trust_effective_rung() IS
  'The GRANTED platform trust rung (§68): the requested rung — ceiling, or a live posture — walked down to the highest rung whose attestation is in date and whose required safety proofs pass. Internal: revoked from every role and reachable only from other SECURITY DEFINER functions, so a tenant never learns the platform posture, only its effect on their own tool. One home, so the number the operator reads and the number that binds cannot drift.';

-- ── 2. The gate consults it. ──
CREATE OR REPLACE FUNCTION public.resolve_tool_autonomy(
  _tenant_id uuid,
  _tool_key  text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := _tenant_id;
  _mode   text;
  _rung   int;
BEGIN
  IF _caller IS NOT NULL THEN
    -- Pin a JWT caller to their own tenant unless they are the platform owner.
    IF NOT public.is_platform_owner() THEN
      _tenant := public.current_user_tenant_id();
    END IF;
  END IF;

  IF _tenant IS NULL OR _tool_key IS NULL THEN
    RETURN 'confirm';
  END IF;

  SELECT mode INTO _mode
  FROM public.tenant_tool_autonomy
  WHERE tenant_id = _tenant AND tool_key = _tool_key;

  _mode := COALESCE(_mode, 'confirm');

  -- ── THE CEILING. §67: effective autonomy is min(grant, floor, ceiling). ──
  -- The tenant's setting is the GRANT. It can only ever narrow from here — a tenant cannot buy
  -- itself more autonomy than the platform is holding, and the platform cannot force a tenant to
  -- accept more than it asked for. Only ever more restrictive, never less.
  _rung := public.trust_effective_rung();
  IF _rung <= 0 THEN
    -- Rung 0: nothing acts unread. Not even a proposal — the point of rung 0 is that Paige is
    -- observing, not offering.
    RETURN 'off';
  ELSIF _rung <= 1 AND _mode = 'auto' THEN
    -- Rung 1: she may draft and ask, never act on her own.
    RETURN 'confirm';
  END IF;

  RETURN _mode;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_tool_autonomy(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tool_autonomy(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_tool_autonomy(uuid, text) IS
  'The mode a tool runs at for a tenant: their own setting (default confirm), CLAMPED by the platform Trust Compass effective rung (§67 min(grant, ceiling)). Rung 0 forces off; rung 1 forces auto down to confirm. Only ever more restrictive than the tenant asked for.';

-- ── 3. The operator getter now reads the SAME number rather than its own copy. ──
CREATE OR REPLACE FUNCTION public.get_platform_trust_compass()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v jsonb; _ceiling int; _posture jsonb; _level int; _until timestamptz; _live boolean := false;
  _requested int; _granted int; _capped text := NULL;
  _attested timestamptz; _proof jsonb; _win interval; _r int; _ok boolean; _need text[]; _c text;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _v FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  IF _v IS NULL THEN RETURN NULL; END IF;

  _ceiling  := COALESCE((_v->>'ceiling')::int, 2);
  _posture  := _v->'posture';
  _attested := (_v->>'attested_at')::timestamptz;

  IF _posture IS NOT NULL AND jsonb_typeof(_posture) = 'object' THEN
    _level := (_posture->>'level')::int;
    _until := (_posture->>'until')::timestamptz;
    _live  := _level IS NOT NULL AND _until IS NOT NULL AND _until > now();
  END IF;

  _requested := CASE WHEN _live THEN _level ELSE _ceiling END;
  _proof     := public.platform_safety_proof_internal();

  -- THE GRANTED RUNG COMES FROM THE ONE HOME, so what the operator reads is exactly what binds
  -- Paige's next write. It was computed here and only here; the gate had no access to it and did
  -- not consult it, so this surface could show a lowered platform while nothing was lowered.
  _granted := public.trust_effective_rung();

  -- `capped_by` is a DISPLAY concern — which of the two conditions ran out first — so it is still
  -- derived here rather than widening the internal function's contract for one string.
  IF _granted < _requested THEN
    FOR _r IN REVERSE _requested..(_granted + 1) LOOP
      _win := public.trust_attestation_window(_r);
      IF _win IS NOT NULL AND (_attested IS NULL OR _attested + _win < now()) THEN
        _capped := 'attestation';
      ELSE
        _ok := true;
        _need := public.trust_required_proof(_r);
        FOREACH _c IN ARRAY _need LOOP
          IF COALESCE(_proof->_c->>'status', 'never_run') <> 'pass' THEN _ok := false; EXIT; END IF;
        END LOOP;
        IF NOT _ok AND _capped IS NULL THEN _capped := 'proof'; END IF;
      END IF;
      EXIT WHEN _capped IS NOT NULL;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ceiling', _ceiling,
    'away',    COALESCE(_v->>'away', 'hold'),
    'domains', COALESCE(_v->'domains', '{}'::jsonb),
    'posture', CASE WHEN _posture IS NULL OR jsonb_typeof(_posture) <> 'object' THEN NULL
                    ELSE _posture || jsonb_build_object('active', _live) END,
    'above_ceiling', _live AND _level > _ceiling,
    'requested', _requested,
    'effective', _granted,
    'capped_by', _capped,
    'authority', jsonb_build_object(
      'attested_at',      _attested,
      'window',           public.trust_attestation_window(_requested)::text,
      'expires_at',       CASE WHEN _attested IS NULL OR public.trust_attestation_window(_requested) IS NULL
                               THEN NULL ELSE _attested + public.trust_attestation_window(_requested) END,
      'required_proof',   to_jsonb(public.trust_required_proof(_requested)),
      'proof',            _proof
    )
  );
END;
$$;

-- §32 PROOF, driven on PRODUCTION Postgres inside BEGIN..ROLLBACK. Nothing persisted.
--
-- Both functions applied, then the clamp driven across every rung against every tenant grant.
-- Nine cases, all matching:
--
--   rung 0 · grant auto ....... off       rung 1 · grant auto ....... confirm
--   rung 0 · grant confirm .... off       rung 1 · grant confirm .... confirm
--   rung 0 · grant off ........ off       rung 1 · grant off ........ off
--   rung 2 · grant auto ....... auto      rung 2 · grant confirm .... confirm
--   rung 4 · grant auto ....... auto
--
-- The clamp only ever narrows: a tenant's `off` is never widened, and a tenant's `auto` is honoured
-- whenever the platform is holding a rung that allows it.
--
-- WHAT THE PROOF FOUND ON THE WAY, which is the part worth keeping. The first draft called
-- `platform_safety_proof()` from `trust_effective_rung()`. That function RAISES
-- `TRUST_COMPASS_FORBIDDEN` for a non-operator, and SECURITY DEFINER changes the ROLE, not
-- `auth.uid()` — so the clamp would have raised inside `resolve_tool_autonomy` on EVERY ordinary
-- tenant write. The proof failed with that exact error before anything shipped, which is why the
-- ungated internal reader exists.
--
-- LIVE STATE AT THE TIME OF THE PROOF, reported rather than assumed:
--   stored ceiling ............................. 3
--   effective rung ............................. 2
--   operator_cross_tenant_canary ............... pass
--   operator_rls_coverage ...................... FAIL
--
-- Two things follow, and both are stated plainly. First: the §68 machinery is ALREADY capping this
-- platform from 3 to 2 because a required safety proof is failing — that is the decay law working,
-- and the failing check is worth an operator's attention on its own. Second: because rung 2 already
-- permits `auto`, THIS CLAMP CHANGES NOTHING ON PRODUCTION TODAY. It makes the control real; it
-- does not currently restrict anything. Claiming otherwise would overstate what shipped.
--
-- §32 OWED: a rollback proof shows the SQL runs. The persisted-apply confirmation is owed after
-- merge and is not claimed here.
