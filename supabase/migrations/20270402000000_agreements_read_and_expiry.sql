-- ============================================================================
-- INT-163 — the agreements engine, slice 3: the read Paige answers from, and the expiry that
-- actually fires.
--
-- WHY THE SWEEPER IS HERE AND NOT "LATER". `paige_agreements.expires_at` was shipped in slice 1 with
-- an index whose comment says "the expiry sweep reads exactly this" — and no sweep existed. That is
-- precisely §68's anchoring failure: a control registered, believed to be running, that has never
-- run, reporting honestly into an empty room. An agreement would have sat at `sent` forever while
-- the surface displayed a deadline that never arrived.
--
-- EXPIRY IS ENFORCED AT USE; THIS IS BOOKKEEPING. The signing endpoint already refuses an expired
-- token AND an expired agreement on every single request, so a signer can never sign past the
-- deadline even if this job stops running. What the job does is make the owner's view true — an
-- abandoned agreement reads `expired` rather than sitting at `sent` indefinitely. Getting that
-- order the other way round is how a dead cron silently becomes an authorization hole.
--
-- ROLLBACK (forward-only production procedure): additive. To reverse, write a forward migration that
-- unschedules the cron job and drops the two functions.
-- ============================================================================

-- ── 1) The read behind Paige's `agreement_status` tool and the tenant's own list ─────────────────
-- SECURITY DEFINER because it aggregates across signers, and §59 therefore requires the caller
-- scope to be re-proved IN THE BODY: the tenant is resolved from the session, the caller-supplied
-- _expected_tenant_id can only REFUSE, and a non-member is turned away before a row is read. It
-- returns no token hash, no storage key and no other tenant's anything.
CREATE OR REPLACE FUNCTION public.paige_agreement_overview(
  _expected_tenant_id uuid,
  _contact_id uuid DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  contact_id uuid,
  contact_name text,
  signers_total integer,
  signers_signed integer,
  outstanding_names text[],
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  document_sha256 text,
  sealed_sha256 text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _tenant uuid := public.current_user_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run' USING ERRCODE = '42501';
  END IF;
  -- A plain member can read their workspace's agreements; only an admin may write one. The write
  -- gate lives in save_paige_agreement / void_paige_agreement, not here.
  IF NOT public.is_tenant_member(_tenant) THEN
    RAISE EXCEPTION 'you are not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.status,
    a.contact_id,
    btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) AS contact_name,
    (SELECT count(*)::integer FROM public.paige_agreement_signers s WHERE s.agreement_id = a.id),
    (SELECT count(*)::integer FROM public.paige_agreement_signers s WHERE s.agreement_id = a.id AND s.status = 'signed'),
    (SELECT coalesce(array_agg(s.full_name ORDER BY s.signing_order), ARRAY[]::text[])
       FROM public.paige_agreement_signers s
      WHERE s.agreement_id = a.id AND s.status <> 'signed'),
    a.sent_at,
    a.completed_at,
    a.expires_at,
    a.content_sha256,
    a.sealed_sha256,
    a.updated_at
  FROM public.paige_agreements a
  LEFT JOIN public.clients c ON c.id = a.contact_id AND c.tenant_id = a.tenant_id
  WHERE a.tenant_id = _tenant
    AND (_contact_id IS NULL OR a.contact_id = _contact_id)
    AND (_status IS NULL OR a.status = _status)
  ORDER BY a.updated_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.paige_agreement_overview(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_agreement_overview(uuid,uuid,text) TO authenticated;

-- ── 2) The sweeper that makes `expires_at` a fact rather than a label ────────────────────────────
-- Pure SQL on a schedule: no edge function, no cron token, nothing to leave undeployed. It also
-- revokes the dead links, so a token cannot outlive the agreement it belongs to even by a minute.
CREATE OR REPLACE FUNCTION public.sweep_expired_paige_agreements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _expired integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT id, tenant_id FROM public.paige_agreements
     WHERE status IN ('sent','viewed','partially_signed')
       AND expires_at IS NOT NULL
       AND expires_at <= now()
     LIMIT 500
  LOOP
    UPDATE public.paige_agreements
       SET status = 'expired', updated_at = now()
     WHERE id = _row.id
       AND status IN ('sent','viewed','partially_signed');

    UPDATE public.paige_agreement_signers
       SET token_revoked_at = now(), updated_at = now()
     WHERE agreement_id = _row.id
       AND token_hash IS NOT NULL
       AND token_revoked_at IS NULL;

    -- The trail records that the system did this, not a person. An expiry nobody can see in the
    -- history is indistinguishable from a status somebody changed by hand.
    INSERT INTO public.paige_agreement_events (agreement_id, tenant_id, event_type, actor_kind, detail)
    VALUES (_row.id, _row.tenant_id, 'expired', 'system',
            jsonb_build_object('swept_at', now()));

    _expired := _expired + 1;
  END LOOP;

  RETURN _expired;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_paige_agreements() FROM PUBLIC, anon, authenticated;

-- Hourly. An agreement's deadline is measured in days, so the hour it flips over is immaterial —
-- what matters is that something flips it at all. Guarded so a replay does not stack duplicate jobs.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('paige-agreements-expiry-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'paige-agreements-expiry-sweep');
    PERFORM cron.schedule(
      'paige-agreements-expiry-sweep',
      '7 * * * *',
      $job$SELECT public.sweep_expired_paige_agreements();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not installed — the agreements expiry sweep was NOT scheduled. Expiry is still enforced at use by the signing endpoint; only the owner-facing status will lag.';
  END IF;
END
$cron$;
