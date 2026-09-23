-- ============================================================================
-- INT-163 — the signer seam, the tier gate, and the grant that did not hold.
--
-- WHY THIS MIGRATION EXISTS. The independent review of the pushed diff found that NOTHING in the
-- repository ever inserted a row into `paige_agreement_signers`. `save_paige_agreement` created the
-- agreement alone; `agreement-send` and `issue_agreement_signing_link` both refused with "add a
-- signer" on every agreement the product could produce. The engine was therefore complete and
-- unreachable: every control below the send — tokens, the ceremony, sealing, notices, retrieval —
-- could never be exercised once, by anybody. That is a §70 failure, not a gap: the code existed and
-- the act did not.
--
-- HOW THE SIGNER IS CREATED, AND WHY BY TRIGGER. An agreement is drafted WITH a client. That client
-- IS the counterparty, so the counterparty is derivable from the row itself rather than from a
-- second call the caller has to know to make. Deriving it in a trigger rather than inside
-- `save_paige_agreement` is deliberate:
--   • it covers EVERY create path — the chat tool, the edge function, the contract RPC the approved
--     page calls, and anything added later — instead of only the one writer that remembered;
--   • the approved page's contract (`create_agreement_signing`) is FROZEN and takes no signers
--     argument, so a writer-side change could not have reached it at all;
--   • `service_role` carries BYPASSRLS, so in this schema triggers are already the enforcement layer
--     rather than policies. This is the same mechanism, used for reachability.
-- A client with no email address yields no signer, and then "add a signer before sending" is both
-- true and actionable through `add_agreement_signer` below.
--
-- ROLLBACK (forward-only production procedure): additive except for the signers-table grant, which
-- is narrowed. Reverse by dropping the two functions and the two triggers, and re-granting SELECT on
-- the whole table, in a forward migration.
-- ============================================================================

-- ── 1) §60/§61 — the tier gate, enforced by the database rather than declared in a helper ────────
-- The review found `agreement_signing` declared as a §61 exception (Solo + Sub-account + Enterprise)
-- with ZERO `hasFeature` call sites: a flag read by no code, recorded in the ledger as live. The
-- send path had the check; every other write path did not, so a pure Agency could draft, void and —
-- once a signer existed — sign through chat. Put here, it binds every caller including the service
-- role, and the ledger's claim becomes true.
--
-- Keyed on the §51 invariant: parentage decides first, so a sub-account can never be read as a
-- manager tier. Enterprise is the hybrid tier and keeps the capability.
CREATE OR REPLACE FUNCTION public.agreement_tier_allows(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT NOT (t.parent_tenant_id IS NULL AND t.account_type = 'agency')
       FROM public.tenants t WHERE t.id = _tenant_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.agreement_tier_allows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agreement_tier_allows(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_agreement_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT public.agreement_tier_allows(NEW.tenant_id) THEN
    RAISE EXCEPTION 'agreements are sent from the account that holds the client relationship; switch into that sub-account and draft it there'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- INSERT **and** UPDATE. INSERT-only left a hole with a real path into it: a tenant that drafts
-- agreements and is later converted to a top-level agency keeps every existing draft, and every
-- write against those rows — sending, freezing, sealing — would still have been permitted by a gate
-- that only ever looked at creation.
DROP TRIGGER IF EXISTS trg_agreement_tier ON public.paige_agreements;
CREATE TRIGGER trg_agreement_tier
  BEFORE INSERT OR UPDATE ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_tier();

-- ── 2) The counterparty signer, derived from the client the agreement is with ────────────────────
CREATE OR REPLACE FUNCTION public.seed_agreement_counterparty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _email text;
  _name  text;
BEGIN
  SELECT btrim(coalesce(c.email,'')),
         btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
    INTO _email, _name
    FROM public.clients c
   WHERE c.id = NEW.contact_id AND c.tenant_id = NEW.tenant_id;

  -- No address means no signer, and the send path's refusal is then the truth rather than a dead
  -- end: the owner adds one explicitly. Never invent an address to make a flow appear to work.
  IF _email IS NULL OR position('@' in _email) < 2 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.paige_agreement_signers
    (agreement_id, tenant_id, full_name, email, signer_role, signing_order)
  VALUES
    (NEW.id, NEW.tenant_id,
     CASE WHEN coalesce(_name,'') = '' THEN split_part(_email, '@', 1) ELSE _name END,
     _email, 'counterparty', 1)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agreement_seed_counterparty ON public.paige_agreements;
CREATE TRIGGER trg_agreement_seed_counterparty
  AFTER INSERT ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.seed_agreement_counterparty();

-- ── 3) Adding a signer explicitly — the multi-party and repair path ──────────────────────────────
-- Same refusal pattern as its siblings: session-derived tenant, `_expected_tenant_id` mismatch is a
-- refusal, `is_tenant_admin` is required. A DISTINCT signing order is assigned by default rather
-- than defaulting every signer to 1, because two signers at the same order can both observe
-- "outstanding = 0" and race the seal (review finding 8).
CREATE OR REPLACE FUNCTION public.add_agreement_signer(
  _expected_tenant_id uuid,
  _signing_id uuid,
  _full_name text,
  _email text,
  _signer_role text DEFAULT 'counterparty',
  _signing_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _status text;
  _order integer;
  _row public.paige_agreement_signers;
  _name text := btrim(coalesce(_full_name,''));
  _mail text := lower(btrim(coalesce(_email,'')));
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may add a signer to an agreement' USING ERRCODE = '42501';
  END IF;
  IF _name = '' THEN
    RAISE EXCEPTION 'a signer needs the name they will sign under' USING ERRCODE = '23514';
  END IF;
  IF position('@' in _mail) < 2 THEN
    RAISE EXCEPTION 'a signer needs an email address the link can be sent to' USING ERRCODE = '23514';
  END IF;
  IF _signer_role NOT IN ('counterparty','tenant_signatory','witness') THEN
    RAISE EXCEPTION 'that is not a signer role this engine understands' USING ERRCODE = '23514';
  END IF;

  SELECT status INTO _status FROM public.paige_agreements
   WHERE id = _signing_id AND tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that agreement is not in this workspace' USING ERRCODE = '42501';
  END IF;
  -- Only a draft. Adding a party to a document other people have already been shown would change
  -- what they agreed to after they agreed to it.
  IF _status <> 'draft' THEN
    RAISE EXCEPTION 'this agreement has already been sent; a signer cannot be added to it now'
      USING ERRCODE = '23514';
  END IF;

  IF _signing_order IS NULL THEN
    SELECT coalesce(max(signing_order), 0) + 1 INTO _order
      FROM public.paige_agreement_signers WHERE agreement_id = _signing_id;
  ELSE
    IF _signing_order < 1 THEN
      RAISE EXCEPTION 'signing order starts at 1' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM public.paige_agreement_signers
      WHERE agreement_id = _signing_id AND signing_order = _signing_order;
    IF FOUND THEN
      RAISE EXCEPTION 'another signer already holds position % on this agreement', _signing_order
        USING ERRCODE = '23505';
    END IF;
    _order := _signing_order;
  END IF;

  INSERT INTO public.paige_agreement_signers
    (agreement_id, tenant_id, full_name, email, signer_role, signing_order)
  VALUES (_signing_id, _tenant, _name, _mail, _signer_role, _order)
  RETURNING * INTO _row;

  INSERT INTO public.paige_agreement_events
    (agreement_id, tenant_id, signer_id, event_type, actor_kind, actor_user_id, detail)
  VALUES (_signing_id, _tenant, _row.id, 'edited', 'owner', _actor,
          jsonb_build_object('added_signer_order', _order));

  -- Deliberately narrow: never the token hash, never the whole row.
  RETURN jsonb_build_object(
    'signer_id', _row.id, 'full_name', _row.full_name, 'email', _row.email,
    'signer_role', _row.signer_role, 'signing_order', _row.signing_order, 'status', _row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_agreement_signer(uuid,uuid,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_agreement_signer(uuid,uuid,text,text,text,integer) TO authenticated;

-- ── 4) The grant that did not hold ───────────────────────────────────────────────────────────────
-- `20270401000000` granted SELECT on the whole table and then revoked SELECT (token_hash).
-- PostgreSQL documents that a column-level revoke has NO EFFECT while the same privilege is held at
-- table level, so the column revoke was decoration and the migration's own comment — that a careless
-- `select *` cannot reach the hash — was false. An explicit column list is the only form that holds.
-- (Bounded exposure: a SHA-256 of 256 random bits yields no working link. It is still a control the
-- file claimed to have and did not.)
REVOKE SELECT ON TABLE public.paige_agreement_signers FROM authenticated;
GRANT SELECT (
  id, agreement_id, tenant_id, full_name, email, signer_role, signing_order,
  token_expires_at, token_revoked_at, status,
  esign_consent_at, esign_consent_slug, esign_consent_version, esign_consent_sha256,
  typed_name, signature_image_png,
  first_viewed_at, signed_at, declined_at, decline_reason,
  signing_ip, signing_user_agent, created_at, updated_at
) ON TABLE public.paige_agreement_signers TO authenticated;

COMMENT ON FUNCTION public.add_agreement_signer(uuid,uuid,text,text,text,integer) IS
  'INT-163 — add a signer to a DRAFT agreement. Tenant from the session, admin-gated, distinct signing order. Never returns the token hash.';
COMMENT ON FUNCTION public.seed_agreement_counterparty() IS
  'INT-163 — derives the counterparty signer from the client an agreement is drafted with, on every create path. No email on the client means no signer, never an invented address.';
COMMENT ON FUNCTION public.agreement_tier_allows(uuid) IS
  'INT-163/§61 — a top-level agency holds no client book, so it holds no agreements. Enterprise, solo and sub-accounts do.';
