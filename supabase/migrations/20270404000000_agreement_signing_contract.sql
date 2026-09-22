-- ============================================================================
-- INT-163 — the callable contract the approved signing page is built against.
--
-- WHAT THIS IS. `docs/delivery/int162-ui-handover.md` records, function by function and column by
-- column, what the owner-approved React route `/sign/:token` calls. That page is built, browser-
-- verified and FROZEN under §28. This migration implements exactly that surface on top of the
-- engine's own tables — the UI calls a contract, not a schema, so the contract is what has to match.
--
-- THE THREE PROPERTIES THE PAGE DEPENDS ON, which live here rather than in the page:
--   1. A token lookup NEVER returns a tenant id, a staff email, or any other row. The page needs the
--      brand, not the identifier behind it. (`resolveHostNames` leaked host auth emails to anon in
--      both guest-booking functions until PR #1246 — the same shape of surface as this one.)
--   2. ONE INDISTINGUISHABLE REFUSAL. Unknown, expired, completed, declined and voided all return a
--      single row with `is_valid = false` and every other column NULL. Telling them apart confirms
--      to a stranger that a guessed token is real, which turns the endpoint into a way to discover
--      which agreements exist. The BUSINESS sees the true state in its own authenticated surface,
--      where it is entitled to.
--   3. Success is unambiguous. `decline_agreement_signing` returns `{ok:true}` only when the decline
--      actually landed; there is no optimistic path.
--
-- HOW THE RETAINED RECORD SURVIVES RULE 2. ESIGN wants the completed document available to BOTH
-- parties, and the counterparty has no account — but rule 2 requires a COMPLETED token to refuse
-- like any other. The two are reconciled by separating the acts rather than weakening either: the
-- signing token dies at completion, and sealing mints a NEW retrieval token that reaches the sealed
-- document through its own endpoint (`agreement-document`). `peek_agreement_signing` therefore
-- refuses a completed agreement with no exception, and the signer still keeps their copy.
--
-- WHY THESE ARE anon-EXECUTABLE SECURITY DEFINER FUNCTIONS, which is normally the #117 leak class.
-- The signer has no Supabase account, so there is no session to gate on and RLS cannot describe
-- them; the 256-bit token IS the credential. The controls that make it safe are the ones #117 says
-- are missing in the leak class: the body hashes the token and looks up by HASH, takes tenant,
-- agreement and signer FROM THE ROW IT FOUND, returns a hand-written allow-list rather than a row,
-- and refuses uniformly. `lint:definer-fns` requires a conscious marker for exactly this case, and
-- each carries one.
--
-- ROLLBACK (forward-only production procedure): additive. Reverse by dropping the five functions in
-- a forward migration.
-- ============================================================================

-- ── Tenant-side ─────────────────────────────────────────────────────────────────────────────────
-- Create a signing. `_agreement_id` is the COMMERCIAL-terms row and is NULLABLE by owner ruling 3:
-- an NDA or a scope letter has no offer and no price, and a contract that cannot represent one is
-- the wrong contract.
CREATE OR REPLACE FUNCTION public.create_agreement_signing(
  _expected_tenant_id uuid,
  _contact_id uuid,
  _agreement_id uuid,
  _document_title text,
  _document_source text,
  _document_body text,
  _document_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE _row jsonb;
BEGIN
  -- Delegates to the engine's own writer so there is ONE write path, one set of authority checks and
  -- one place the tenant links are proved. This function is the contract's NAME for that act.
  _row := public.save_paige_agreement(
    _expected_tenant_id := _expected_tenant_id,
    _agreement_id       := NULL,
    _contact_id         := _contact_id,
    _title              := _document_title,
    _body_markdown      := _document_body,
    _offer_id           := NULL,
    _commercial_terms_id:= _agreement_id,
    _body_source        := _document_source,
    _source_version_id  := NULL,
    _document_path      := _document_path
  );
  RETURN jsonb_build_object(
    'signing_id', _row ->> 'id',
    'signature_state', _row ->> 'status'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_agreement_signing(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_agreement_signing(uuid,uuid,uuid,text,text,text,text) TO authenticated;

-- Mint the signing link. THE RAW TOKEN IS RETURNED EXACTLY ONCE and is never retrievable again —
-- only its SHA-256 is stored, so there is nothing to re-read. A caller that loses it re-issues.
CREATE OR REPLACE FUNCTION public.issue_agreement_signing_link(
  _expected_tenant_id uuid,
  _signing_id uuid,
  _ttl_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _token text;
  _expires timestamptz;
  _signer uuid;
  _status text;
  _src text;
  _body text;
  _frozen text;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may issue a signing link' USING ERRCODE = '42501';
  END IF;
  IF _ttl_days IS NULL OR _ttl_days < 1 OR _ttl_days > 365 THEN
    RAISE EXCEPTION 'a signing link lasts between 1 and 365 days' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO _status FROM public.paige_agreements
   WHERE id = _signing_id AND tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that agreement is not in this workspace' USING ERRCODE = '42501';
  END IF;
  IF _status IN ('completed','declined','voided','expired') THEN
    RAISE EXCEPTION 'this agreement is already %; a new link cannot be issued for it', _status
      USING ERRCODE = '23514';
  END IF;

  SELECT id INTO _signer FROM public.paige_agreement_signers
   WHERE agreement_id = _signing_id ORDER BY signing_order LIMIT 1;
  IF _signer IS NULL THEN
    RAISE EXCEPTION 'add a signer before issuing a link' USING ERRCODE = '23514';
  END IF;

  -- FREEZE BEFORE THE LINK EXISTS. The moment a token is issued somebody can be shown the document,
  -- so the digest of what they will be shown is recorded first. For a text body that is the body
  -- itself, which is exactly what the page renders. An uploaded FILE cannot be hashed from here —
  -- the database cannot read storage — so that path refuses and goes through the send function,
  -- which can read the object and hash its real bytes. Refusing is the point: a link issued against
  -- an unhashed document would make "the signer saw exactly this" unprovable from the first minute.
  SELECT body_source, body_markdown, content_sha256 INTO _src, _body, _frozen
    FROM public.paige_agreements WHERE id = _signing_id;
  IF _frozen IS NULL THEN
    IF _src = 'tenant_upload' THEN
      RAISE EXCEPTION 'an uploaded document is frozen when it is sent; use the send path so its real bytes are hashed'
        USING ERRCODE = '23514';
    END IF;
    _frozen := encode(digest(coalesce(_body,''), 'sha256'), 'hex');
  END IF;

  -- gen_random_bytes(32) is 256 bits from pgcrypto's CSPRNG. Only the digest is stored.
  _token := encode(gen_random_bytes(32), 'hex');
  _expires := now() + make_interval(days => _ttl_days);

  UPDATE public.paige_agreement_signers
     SET token_hash = encode(digest(_token, 'sha256'), 'hex'),
         token_expires_at = _expires,
         token_revoked_at = NULL,
         updated_at = now()
   WHERE id = _signer;

  UPDATE public.paige_agreements
     SET content_sha256 = coalesce(content_sha256, _frozen),
         status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
         sent_at = coalesce(sent_at, now()),
         expires_at = _expires,
         updated_at = now()
   WHERE id = _signing_id AND tenant_id = _tenant;

  INSERT INTO public.paige_agreement_events
    (agreement_id, tenant_id, signer_id, event_type, actor_kind, actor_user_id)
  VALUES (_signing_id, _tenant, _signer, 'sent', 'owner', _actor);

  RETURN jsonb_build_object('signing_id', _signing_id, 'token', _token, 'expires_at', _expires);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_agreement_signing_link(uuid,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_agreement_signing_link(uuid,uuid,integer) TO authenticated;

-- Void. The contract is explicit that this must NULL the token hash so the live link genuinely stops
-- working rather than merely being relabelled — a "voided" row whose link still opens is the exact
-- failure the word is supposed to prevent.
CREATE OR REPLACE FUNCTION public.void_agreement_signing(
  _expected_tenant_id uuid,
  _signing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  PERFORM public.void_paige_agreement(_expected_tenant_id, _signing_id, NULL);
  -- void_paige_agreement revokes; the contract additionally requires the hash gone, so a leaked
  -- token cannot even be tested for existence afterwards.
  UPDATE public.paige_agreement_signers
     SET token_hash = NULL, token_expires_at = NULL, updated_at = now()
   WHERE agreement_id = _signing_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_agreement_signing(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_agreement_signing(uuid,uuid) TO authenticated;

-- ── Public, token-keyed ─────────────────────────────────────────────────────────────────────────
-- definer-anon-exempt: the signer is an external counterparty with no Supabase account, so there is
-- no session to gate on and RLS cannot describe them; the 256-bit token is the credential. The body
-- looks up by SHA-256 of the presented token, derives tenant/agreement/signer FROM THAT ROW, returns
-- a hand-written allow-list that contains no tenant id and no staff address, and refuses uniformly.
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
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _hash text;
  _s record;
  _a record;
  _t record;
  -- Scalars, NOT a record. A `record` that is never assigned raises "not-yet-assigned" the moment it
  -- is referenced, and the branch that leaves it unassigned is precisely the one owner ruling 3
  -- exists for: an NDA with no offer and no price. Reading this would have crashed the page for the
  -- case the ruling was written to guarantee.
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

  SELECT * INTO _s FROM public.paige_agreement_signers WHERE token_hash = _hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::text,
                        NULL::bigint, NULL::text, NULL::text, NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  SELECT * INTO _a FROM public.paige_agreements WHERE id = _s.agreement_id;

  -- ONE refusal for every reason. Revoked, expired (token or agreement), already signed by this
  -- person, or an agreement in any state that is not open for signature — all leave by the same
  -- door, returning the same shape with nothing in it.
  IF _s.token_revoked_at IS NOT NULL
     OR _s.token_expires_at IS NULL OR _s.token_expires_at <= now()
     OR _s.status IN ('signed','declined')
     OR _a.id IS NULL
     OR _a.status NOT IN ('sent','viewed','partially_signed')
     OR (_a.expires_at IS NOT NULL AND _a.expires_at <= now())
  THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::text,
                        NULL::bigint, NULL::text, NULL::text, NULL::timestamptz, NULL::text, false;
    RETURN;
  END IF;

  SELECT t.name, t.brand INTO _t FROM public.tenants t WHERE t.id = _a.tenant_id;

  -- The figure comes from the linked commercial-terms row when there is one. Ruling 3: there may be
  -- none, and then the page shows a document with no price rather than refusing to exist.
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
    coalesce(_t.brand, '{}'::jsonb),
    _s.full_name,
    _amount_minor,
    _amount_currency,
    _term_summary,
    _s.token_expires_at,
    -- partially_signed is an internal distinction; to the person in front of the document it is
    -- simply awaiting signature.
    CASE WHEN _a.status = 'partially_signed' THEN 'sent' ELSE _a.status END,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.peek_agreement_signing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_agreement_signing(text) TO anon, authenticated;

-- definer-anon-exempt: same reasoning as peek_agreement_signing — the signer holds a token, not a
-- session. The decline is conditional on the row still being declinable, so a replay is not a second
-- decline, and `ok` is true only when a row actually changed.
CREATE OR REPLACE FUNCTION public.decline_agreement_signing(_token text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _hash text;
  _s record;
  _a record;
  _changed integer := 0;
BEGIN
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  _hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT * INTO _s FROM public.paige_agreement_signers WHERE token_hash = _hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  SELECT * INTO _a FROM public.paige_agreements WHERE id = _s.agreement_id;
  IF _a.id IS NULL
     OR _s.token_revoked_at IS NOT NULL
     OR _s.token_expires_at IS NULL OR _s.token_expires_at <= now()
     OR _a.status NOT IN ('sent','viewed','partially_signed')
  THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.paige_agreement_signers
     SET status = 'declined', declined_at = now(),
         decline_reason = left(coalesce(_reason,''), 1000), updated_at = now()
   WHERE id = _s.id AND status IN ('pending','viewed');
  GET DIAGNOSTICS _changed = ROW_COUNT;
  IF _changed = 0 THEN RETURN jsonb_build_object('ok', false); END IF;

  -- One decline ends it for everyone and kills every remaining link. Leaving it live would strand
  -- later signers behind somebody who will never sign, while the document still looked open.
  UPDATE public.paige_agreements
     SET status = 'declined', declined_at = now(), updated_at = now()
   WHERE id = _a.id AND status IN ('sent','viewed','partially_signed');

  UPDATE public.paige_agreement_signers
     SET token_revoked_at = now(), updated_at = now()
   WHERE agreement_id = _a.id AND token_hash IS NOT NULL AND token_revoked_at IS NULL;

  INSERT INTO public.paige_agreement_events
    (agreement_id, tenant_id, signer_id, event_type, actor_kind, actor_email, detail)
  VALUES (_a.id, _a.tenant_id, _s.id, 'declined', 'signer', _s.email,
          jsonb_build_object('reason', nullif(btrim(coalesce(_reason,'')), '')));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.decline_agreement_signing(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_agreement_signing(text,text) TO anon, authenticated;
