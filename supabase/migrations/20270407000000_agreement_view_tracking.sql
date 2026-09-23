-- ============================================================================
-- INT-163 — the signer's VIEW is recorded again, and the owner is told the truth about it.
--
-- WHAT THE PEER-GATE FOUND. When the HTML endpoint was deleted under the architecture ruling, the
-- view write went with it and nothing replaced it: NOTHING in the repository wrote
-- `paige_agreement_signers.first_viewed_at`, moved a signer to `viewed`, or moved an agreement to
-- `viewed`. The columns existed, the status machine allowed the transition, the audit trail declared
-- a `viewed` event type — and no code path could ever produce one. So the owner's own surface could
-- never distinguish "sent and ignored" from "opened and being read", which is most of what an
-- e-signature status view is FOR, and `K12`'s `draft -> sent -> viewed -> completed` walk was
-- reachable only because the proof drove the transition by hand.
--
-- WHY IT LIVES IN `peek_agreement_signing`. Opening the page IS the view, and `peek` is the one call
-- the page makes to open it (§18 — one home). The alternative was a second endpoint whose only job
-- is to say "I looked", which the page could forget to call and which would then drift.
--
-- THE FUNCTION STOPS BEING `STABLE`, deliberately. It now writes, so it cannot claim otherwise —
-- and a `STABLE` function that writes is a lie Postgres is entitled to optimise around. The write is
-- strictly first-time-only and strictly forward: `WHERE status = 'pending'` on the signer and
-- `WHERE status = 'sent'` on the agreement, so a reload records nothing, a signed or declined signer
-- is untouched, and the one-way status trigger is never fought.
--
-- WHAT THIS DOES NOT DO, stated rather than implied (§13). It does not notify the owner that a
-- signer opened the document, and it does not notify them of a DECLINE — the deleted endpoint did
-- both, and a database function cannot send mail. Both are real gaps, declared in the PR rather than
-- quietly absent: the owner sees `viewed` and `declined` on their own authenticated surface through
-- `paige_agreement_overview`, and the email notices return with the seam that can send them.
--
-- WHY THE AGREEMENT GETS ITS OWN `viewed_at` AND NOT JUST A STATUS. The agreement row already
-- carries `sent_at`, `completed_at`, `declined_at` and `voided_at` — one timestamp per lifecycle
-- transition — and `viewed` was the single transition with a status and no time. That asymmetry is
-- mine and predates anyone asking about it: every consumer wanting "when was this first opened"
-- would have had to aggregate `min(first_viewed_at)` across the signer rows to recover something
-- its four siblings state directly. So the two are recorded at two grains, in one statement:
--   • `paige_agreement_signers.first_viewed_at` — WHICH party opened it and WHEN, per signer.
--   • `paige_agreements.viewed_at`              — when it was first opened BY ANYONE, set once.
-- `coalesce(viewed_at, now())` is what makes the second one "first", not "latest": a second signer
-- opening the document later never rewrites the moment the first one did.
--
-- ROLLBACK (forward-only production procedure): adds one nullable column and replaces one function.
-- Reverse by dropping the column and restoring the previous definition from `20270404000000` in a
-- forward migration.
-- ============================================================================

ALTER TABLE public.paige_agreements
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

COMMENT ON COLUMN public.paige_agreements.viewed_at IS
  'When this agreement was first opened by any signer. Set once, never rewritten by a later opening. Per-signer detail is paige_agreement_signers.first_viewed_at.';

CREATE OR REPLACE FUNCTION public.peek_agreement_signing(_token text)
RETURNS TABLE (
  document_title text,
  document_body text,
  document_path text,
  business_name text,
  brand jsonb,
  signer_display_name text,
  amount_minor bigint,
  amount_currency text,
  term_summary text,
  expires_at timestamptz,
  signature_state text,
  is_valid boolean
)
LANGUAGE plpgsql
-- NOT STABLE: this records the view. See the header.
VOLATILE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _hash text;
  _s record;
  _a record;
  _t record;
  _amount_minor bigint := NULL;
  _amount_currency text := NULL;
  _term_summary text := NULL;
BEGIN
  -- Shape first: anything that is not 64 hex characters is refused without touching a table.
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::text,
                        NULL::bigint, NULL::text, NULL::text, NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  _hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT s.* INTO _s FROM public.paige_agreement_signers s WHERE s.token_hash = _hash;
  IF NOT FOUND
     OR _s.token_revoked_at IS NOT NULL
     OR _s.token_expires_at IS NULL OR _s.token_expires_at <= now()
     OR _s.status IN ('signed','declined')
  THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::text,
                        NULL::bigint, NULL::text, NULL::text, NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  SELECT a.* INTO _a FROM public.paige_agreements a WHERE a.id = _s.agreement_id;
  IF NOT FOUND
     OR _a.status NOT IN ('sent','viewed','partially_signed')
     OR (_a.expires_at IS NOT NULL AND _a.expires_at <= now())
  THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::text,
                        NULL::bigint, NULL::text, NULL::text, NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  -- ── THE VIEW, recorded once ───────────────────────────────────────────────────────────────────
  -- Only from `pending`, so a reload is not a second view and a signer who is mid-ceremony is not
  -- rewound. The audit row is filed only when the signer row actually moved, so the trail counts
  -- openings rather than page loads.
  UPDATE public.paige_agreement_signers
     SET status = 'viewed', first_viewed_at = now(), updated_at = now()
   WHERE id = _s.id AND status = 'pending';

  IF FOUND THEN
    INSERT INTO public.paige_agreement_events
      (agreement_id, tenant_id, signer_id, event_type, actor_kind, actor_email)
    VALUES (_a.id, _a.tenant_id, _s.id, 'viewed', 'signer', _s.email);

    -- Forward only, and only from `sent`: a partially-signed agreement does not fall back to viewed.
    -- `viewed_at` is set outside that status guard and coalesced, so the FIRST open is recorded even
    -- when the agreement has already moved on — and is never overwritten by a later one.
    UPDATE public.paige_agreements
       SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
           viewed_at = coalesce(viewed_at, now()),
           updated_at = now()
     WHERE id = _a.id AND status IN ('sent','viewed','partially_signed');

    -- Reflect what we just wrote rather than the row read a moment ago.
    _s.status := 'viewed';
  END IF;

  SELECT t.name, t.brand INTO _t FROM public.tenants t WHERE t.id = _a.tenant_id;

  IF _a.commercial_terms_id IS NOT NULL THEN
    SELECT tca.agreed_amount_minor, tca.agreed_currency, tca.term_kind
      INTO _amount_minor, _amount_currency, _term_summary
      FROM public.tenant_client_agreements tca
     WHERE tca.id = _a.commercial_terms_id AND tca.tenant_id = _a.tenant_id;
  END IF;

  RETURN QUERY SELECT
    _a.title,
    _a.body_markdown,
    _a.document_path,
    _t.name,
    _t.brand,
    _s.full_name,
    _amount_minor,
    _amount_currency,
    _term_summary,
    _a.expires_at,
    _a.status,
    true;
END;
$$;

-- definer-anon-exempt: the signer has no Supabase account, so there is no session to gate on — the
-- 256-bit token IS the credential. The body hashes it, looks up BY HASH, takes tenant, agreement and
-- signer from the row it found, returns a hand-written allow-list rather than a row, and refuses
-- every failure uniformly. Unchanged from 20270404000000; restated because the grant is re-issued.
REVOKE ALL ON FUNCTION public.peek_agreement_signing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_agreement_signing(text) TO anon, authenticated;
