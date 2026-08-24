-- §68 — Authority expires and must be re-earned.
--
-- Owner ruling, 2026-08-24: "No authority should be permanent. With certain levels of automation
-- and autonomy there has to be security loops, checking for bugs making sure that they are working.
-- That's also with systems checks for."
--
-- `20260929000000` made the POSTURE expire and left the CEILING permanent. That is the half this
-- migration corrects: a ceiling set once in March is not evidence that the platform is safe in
-- August. Two independent conditions now hold a rung up, and BOTH must hold:
--
--   1. ATTESTATION (time)  — a human re-affirmed the rung recently enough. The window SHORTENS as
--      the rung rises: the more Paige may do unwatched, the more often someone must say so.
--   2. PROOF (safety loop) — the checks that prove the platform's isolation invariants are actually
--      holding are PASSING on their most recent run.
--
-- When either lapses the rung degrades to 1 (Draft for review) — never to 0, which would strand
-- work silently, and never quietly: the read reports which condition failed and what would restore
-- it. A clamp the operator cannot see is indistinguishable from a bug.
--
-- WHAT IS DELIBERATELY *NOT* A GATE: operator_db_health. A 437-second query is a performance
-- signal, not a safety invariant — revoking Paige's authority over it would be a false alarm, and
-- false alarms train an operator to ignore the mechanism. Performance belongs to alerting.
-- Authority gates on ISOLATION: can Paige act across a tenant boundary, and is RLS still covering
-- the tables. Those are the invariants whose failure makes autonomous action dangerous.
--
-- WHY 'pass' IS THE ONLY AFFIRMATIVE STATE: the runners emit fail / skip / error, and the skip
-- REASONS do not cleanly separate "nothing to measure" from "this loop never ran" — measured
-- historically, `no_llm_activity` and `canary_never_run` both carry needs_config NULL. Rather than
-- parse runner-authored free text that will drift, this asks the only question that is stable:
-- did the check AFFIRMATIVELY prove the invariant on its latest run? Absence of proof is not proof.

-- ── 1. The proof reader ──────────────────────────────────────────────────────────────────────
-- One home (§18) for "what do the safety loops currently say". §59: SECURITY DEFINER, so the body
-- re-enforces caller scope rather than trusting the EXECUTE grant.
CREATE OR REPLACE FUNCTION public.platform_safety_proof()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'TRUST_COMPASS_FORBIDDEN: platform operator scope required'
      USING ERRCODE = '42501';
  END IF;

  -- Latest finding per operator-scope, platform-scope check. A check that has NEVER produced a
  -- finding is absent from `latest` and surfaces below as status 'never_run' — not as a pass.
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

COMMENT ON FUNCTION public.platform_safety_proof() IS
  '§68 safety loops: latest status of the isolation-invariant checks that gate autonomy rungs. '
  '"pass" is the only affirmative state; never_run/skip/fail/error all mean the invariant is unproven.';

-- ── 2. Attestation windows ───────────────────────────────────────────────────────────────────
-- Rungs 0-1 never expire: Observe and Draft-for-review are safe by construction because a human
-- reads every output before it leaves. Expiry begins exactly where unread action begins.
CREATE OR REPLACE FUNCTION public.trust_attestation_window(_rung int)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN _rung <= 1 THEN NULL::interval  -- no expiry; nothing acts unread
           WHEN _rung = 2  THEN interval '30 days'
           WHEN _rung = 3  THEN interval '14 days'
           ELSE                 interval '7 days'   -- rung 4, full auto
         END;
$$;

COMMENT ON FUNCTION public.trust_attestation_window(int) IS
  '§68: how long a rung stands on one human attestation. Shortens as the rung rises — the more '
  'Paige may do unwatched, the more often someone must re-affirm it.';

-- ── 3. Which proof each rung requires ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trust_required_proof(_rung int)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN _rung <= 1 THEN ARRAY[]::text[]
           WHEN _rung = 2  THEN ARRAY['operator_cross_tenant_canary']
           ELSE                 ARRAY['operator_cross_tenant_canary','operator_rls_coverage']
         END;
$$;

COMMENT ON FUNCTION public.trust_required_proof(int) IS
  '§68: the isolation invariants that must be PASSING for a rung to hold. Rung 2+ requires the '
  'cross-tenant leak canary; rung 3+ additionally requires RLS coverage. Performance checks are '
  'deliberately excluded — a slow query is an alert, not grounds to revoke authority.';

-- ── 4. Seed the existing ceiling with an attestation ─────────────────────────────────────────
-- The owner set the live ceiling deliberately; that WAS an attestation. Stamping it now means the
-- time condition starts its clock here rather than firing retroactively on a rung nobody neglected.
UPDATE public.admin_app_settings
   SET value = value || jsonb_build_object(
         'attested_at', to_jsonb(now()),
         'attested_by', 'migration:20261001000000 (§68 — existing owner-set ceiling carried forward)'
       )
 WHERE key = 'paige_trust_compass'
   AND value->>'attested_at' IS NULL;

-- ── 5. Re-attestation ────────────────────────────────────────────────────────────────────────
-- Renewing authority is the same act as granting it, so it carries the same authority: raising or
-- renewing a rung is super_admin (§53). This does not change the rung — it re-affirms the one set.
CREATE OR REPLACE FUNCTION public.attest_platform_trust(_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v jsonb; _rung int;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'TRUST_ATTEST_FORBIDDEN: re-affirming platform authority is super_admin only'
      USING ERRCODE = '42501';
  END IF;

  SELECT value INTO _v FROM public.admin_app_settings WHERE key = 'paige_trust_compass';
  IF _v IS NULL THEN
    RAISE EXCEPTION 'TRUST_ATTEST_UNSET: no Trust Compass to attest' USING ERRCODE = '22023';
  END IF;

  _rung := COALESCE((_v->>'ceiling')::int, 2);

  UPDATE public.admin_app_settings
     SET value = value || jsonb_build_object(
           'attested_at', to_jsonb(now()),
           'attested_by', COALESCE(NULLIF(_note, ''), 'operator re-attestation')
         )
   WHERE key = 'paige_trust_compass';

  INSERT INTO public.paige_audit_log (action, actor_user_id, metadata)
  VALUES ('platform.trust_authority.attested', auth.uid(),
          jsonb_build_object('rung', _rung, 'note', _note,
                             'window', public.trust_attestation_window(_rung)::text));

  RETURN public.get_platform_trust_compass();
END;
$$;

REVOKE ALL ON FUNCTION public.attest_platform_trust(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attest_platform_trust(text) TO authenticated;
REVOKE ALL ON FUNCTION public.platform_safety_proof() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_safety_proof() TO authenticated;

COMMENT ON FUNCTION public.attest_platform_trust(text) IS
  '§68: re-affirm the current ceiling, restarting its attestation window. super_admin only — '
  'renewing authority carries the same authority as granting it.';

-- ── 6. The read applies both conditions ──────────────────────────────────────────────────────
-- `effective` stays the field every consumer already reads, and it is now the GRANTED rung — the
-- clamp lives at the source rather than in each caller (§57: surfaces derive, they do not each
-- compute their own answer). `requested` is published alongside it so nothing is hidden: an
-- operator can always see the rung they set, the rung actually in force, and which condition
-- separated the two.
--
-- The step-down walks DOWN from the requested rung to the highest one whose conditions hold,
-- rather than collapsing to 1. Proof for rung 2 but not rung 3 should grant rung 2 — dropping such
-- a platform to Draft would be a punishment, not a safety measure, and requirements are monotonic
-- so the walk is well-defined.
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

  -- The live posture is what was asked for, whichever side of the ceiling it sits on.
  _requested := CASE WHEN _live THEN _level ELSE _ceiling END;
  _proof     := public.platform_safety_proof();

  -- Walk down to the highest rung both conditions support.
  _granted := 0;
  FOR _r IN REVERSE _requested..0 LOOP
    _ok  := true;
    _win := public.trust_attestation_window(_r);
    IF _win IS NOT NULL AND (_attested IS NULL OR _attested + _win < now()) THEN
      _ok := false;
      IF _capped IS NULL THEN _capped := 'attestation'; END IF;
    END IF;
    IF _ok THEN
      _need := public.trust_required_proof(_r);
      FOREACH _c IN ARRAY _need LOOP
        IF COALESCE(_proof->_c->>'status', 'never_run') <> 'pass' THEN
          _ok := false;
          IF _capped IS NULL OR _capped = 'attestation' THEN _capped := 'proof'; END IF;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF _ok THEN _granted := _r; EXIT; END IF;
  END LOOP;

  IF _granted >= _requested THEN _capped := NULL; END IF;

  RETURN jsonb_build_object(
    'ceiling', _ceiling,
    'away',    COALESCE(_v->>'away', 'hold'),
    'domains', COALESCE(_v->'domains', '{}'::jsonb),
    'posture', CASE WHEN _posture IS NULL OR jsonb_typeof(_posture) <> 'object' THEN NULL
                    ELSE _posture || jsonb_build_object('active', _live) END,
    'above_ceiling', _live AND _level > _ceiling,
    -- §68 — what was asked for, what is actually in force, and why they differ.
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

COMMENT ON FUNCTION public.get_platform_trust_compass() IS
  '§68: returns the GRANTED rung as `effective` — the requested rung clamped by attestation age and '
  'by the safety loops that must be passing for it. `requested` and `capped_by` are published '
  'alongside so a clamp is always visible, never silent.';

-- ── 7. Make the safety loop real ─────────────────────────────────────────────────────────────
-- The cross-tenant leak canary gates rung 2+, and it had NEVER run: `security-canary-probe` ships
-- as an edge function and as a registered blocking check, but nothing ever invoked it — zero rows
-- in security_canary_runs across the platform's whole life. The check honestly reported 'skip /
-- canary_never_run' 342 times and nobody was listening. Conditioning authority on a loop that does
-- not run would just pin the platform at Draft forever, so the loop is scheduled here, in the same
-- migration that starts depending on it.
--
-- Hourly, offset to :20 so it does not collide with the systems-check operator sweep at :00 — the
-- canary must have written its result BEFORE the check that reads it runs.
SELECT cron.schedule(
  'security-canary-probe',
  '20 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/security-canary-probe',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $cron$
);
