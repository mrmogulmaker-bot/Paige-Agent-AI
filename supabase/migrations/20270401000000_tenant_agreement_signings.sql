-- definer-anon-exempt: peek_agreement_signing and decline_agreement_signing ARE the pre-auth
-- signing surface. A person who has been sent an agreement has no account here, so the only
-- credential they can hold is the token in their link. Both derive EVERYTHING from that token,
-- accept no tenant/contact/agreement id, return no tenant_id and no staff address, and answer
-- every invalid token — bad, expired, completed, declined, voided, unknown — with the SAME empty
-- result, so neither can be used to enumerate anything (§9/§59, #117 audit).
--
-- INT-162 — a client signs the agreement the business sent them.
--
-- ─── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────────────────────
--
-- `tenant_client_agreements` (20261200000000) records what one client AGREED TO — the commercial
-- fact. This table records a SIGNING: one document, sent to one named client, at a link, which
-- they either sign, decline, or let expire. Those are two different facts about the same deal and
-- they move independently, which is why `tenant_client_agreements.status` is not touched from
-- here and no column below mirrors it. Owner ruling, 2026-09-22: "signature state is SEPARATE
-- from commercial state."
--
-- It is not a payment surface. There is no card field, no Stripe customer, intent or
-- subscription, no stored authorisation, and no state that could imply one — §38: Paige is never
-- merchant of record for a tenant→client charge, and this table cannot make it one. The agreed
-- amount the signer is shown is read from the linked agreement and is DESCRIPTIVE only; nothing
-- here charges, invoices, schedules or duns off it.
--
-- ─── THE VOCABULARY, WHICH IS A RULING AND NOT A PREFERENCE ──────────────────────────────────
--
-- No DocuSign noun appears in this file: no envelope, no recipient, no tabs, no anchor tag, no
-- certificate of completion. `paige_signature_envelopes` already owns "envelope" on the legacy
-- path, and a native table named around the same noun would read as the same thing while being a
-- different thing. A signing is a signing.
--
-- ─── THE STATE SET, AND THE ONE THAT WAS DELETED ─────────────────────────────────────────────
--
-- draft · sent · viewed · completed · declined · voided · expired.
--
-- 'signed' was in an earlier draft and is deliberately ABSENT. With one signer there is no moment
-- at which 'signed' and 'completed' differ — nothing in the system could ever distinguish them —
-- and a state no observation can tell apart from its neighbour is a lie the surface would have to
-- keep telling (§13). It collapses into 'completed'. There is likewise no 'paid', 'invoiced' or
-- 'delivered': this table can observe none of those (§38).
--
-- ─── VERSION ─────────────────────────────────────────────────────────────────────────────────
--
-- 20270401000000. Chosen against a tree whose highest migration is 20270331000000 and a remote
-- scan that shows nothing in the 202704 band. RE-VERIFY THIS BEFORE COMMIT if the branch has sat:
-- the model migration this file is built on records THREE live collisions caught by exactly that
-- re-check, which is why it is a step and not a courtesy.

CREATE TABLE IF NOT EXISTS public.tenant_agreement_signings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOT NULL, and it is the ONLY scope. Every §9 predicate in this file keys on it directly
  -- rather than reaching through `clients` — a signing whose tenancy had to be derived from its
  -- contact would be unreadable the moment that contact moved or was deleted, and the anon path
  -- below needs a tenant it can resolve from the token row alone.
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- RESTRICT, not CASCADE, for the same reason the agreement uses it: deleting a client who has
  -- a signed contract on file must fail loudly rather than silently taking the signature with it.
  contact_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,

  -- NULLABLE, by owner ruling (2026-09-22, ruling 3). An NDA, a scope letter and a mutual
  -- confidentiality agreement are all real things a business sends a client, and none of them has
  -- an offer or a price. Making this NOT NULL would have forced a fake agreement row to exist
  -- before an NDA could be sent, which is the sort of workaround that quietly becomes the model.
  -- SET NULL on delete: losing the commercial record must not destroy the signed document.
  agreement_id uuid REFERENCES public.tenant_client_agreements(id) ON DELETE SET NULL,

  -- ── THE DOCUMENT ────────────────────────────────────────────────────────────────────────────
  document_title  text NOT NULL,

  -- Where the wording came from. It is recorded because the three differ in what a dispute would
  -- ask of them: an upload is the tenant's own paper, a Paige draft was generated and reviewed,
  -- a template was approved once and reused.
  document_source text NOT NULL
    CHECK (document_source IN ('tenant_upload','paige_draft','tenant_template')),

  -- Exactly one of these carries the wording. `document_body` is the exact text when the document
  -- IS text — stored rather than referenced, because the signed PDF must be reproducible from
  -- what the signer actually saw, and a template that moves afterwards would silently rewrite it.
  document_body   text,
  document_path   text,

  -- ── THE LINK ────────────────────────────────────────────────────────────────────────────────
  -- The RAW token is NEVER stored. It is generated server-side, returned to the caller exactly
  -- once, and kept here only as its SHA-256. A database read — a backup, a support query, a leaked
  -- dump — therefore cannot produce a working link. UNIQUE allows many NULLs, which is what the
  -- terminal states below need: every voided, declined and completed row carries NULL here.
  token_hash text UNIQUE,
  expires_at timestamptz,

  -- ── THE STATE ───────────────────────────────────────────────────────────────────────────────
  signature_state text NOT NULL DEFAULT 'draft'
    CHECK (signature_state IN ('draft','sent','viewed','completed','declined','voided','expired')),
  sent_at        timestamptz,
  viewed_at      timestamptz,
  completed_at   timestamptz,
  declined_at    timestamptz,
  voided_at      timestamptz,
  decline_reason text,

  -- ── WHAT THE SIGNER DID ─────────────────────────────────────────────────────────────────────
  -- `signer_drew` records whether they drew a mark or only typed their name. Both are signatures;
  -- they are not the same evidence, and collapsing them would make the record claim more than it
  -- can support.
  signer_name       text,
  signer_drew       boolean NOT NULL DEFAULT false,
  consent_read      boolean NOT NULL DEFAULT false,
  consent_esign     boolean NOT NULL DEFAULT false,
  signed_pdf_path   text,
  signer_ip         inet,
  signer_user_agent text,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ── CONSTRAINTS THAT MAKE THE MODEL HONEST ──────────────────────────────────────────────────

  -- A signing with neither text nor a file is a row about nothing. One of the two must carry the
  -- wording, or there is no document to sign and no document to produce afterwards.
  CONSTRAINT tas_has_a_document_ck CHECK (
    document_body IS NOT NULL OR document_path IS NOT NULL),

  -- 'Completed' is the single claim in this table that a person may be held to, so it is the one
  -- the database refuses to let the surface make on faith. It asserts four things at once: a name
  -- was given, both consents were taken, and the PDF that proves all of it EXISTS. The failure
  -- this forecloses is specific and has already shipped once elsewhere in this repo: an upload
  -- that silently failed, a row marked complete anyway, and a Completed badge over a NULL path
  -- (`finalize-agreement:198-207`). Here that row cannot be written at all.
  CONSTRAINT tas_completed_is_evidenced_ck CHECK (
    signature_state <> 'completed' OR (
      signer_name IS NOT NULL
      AND consent_read
      AND consent_esign
      AND signed_pdf_path IS NOT NULL)),

  -- A row that says it is AWAITING a signature must have a live link, or the surface is telling
  -- the tenant to wait for something nobody can do.
  --
  -- THE CONTRACT'S LITERAL FORM WAS `signature_state = 'draft' OR signature_state = 'voided' OR
  -- (token_hash IS NOT NULL AND expires_at IS NOT NULL)`, and it is NOT what is written here,
  -- deliberately. That predicate exempts only draft and voided — while BOTH
  -- `decline_agreement_signing` and the signing edge function are required to NULL the token_hash
  -- so the live link genuinely stops working. Declining or completing would therefore have
  -- violated this very CHECK, making both terminal states unreachable. Reproduced before this was
  -- rewritten, and the reproduction is kept as an assertion in
  -- `scripts/proofs/int162-signings-proof.sql` so the correction is evidenced rather than
  -- asserted. The predicate below says the intended thing directly: awaiting means sent or
  -- viewed, and only those two need a live link.
  CONSTRAINT tas_sent_has_link_ck CHECK (
    signature_state NOT IN ('sent','viewed')
    OR (token_hash IS NOT NULL AND expires_at IS NOT NULL)),

  -- A decline with no time is not a record of a decline.
  CONSTRAINT tas_declined_ck CHECK (
    signature_state <> 'declined' OR declined_at IS NOT NULL),

  -- Both paths are storage keys in the `tenant-agreements` bucket, whose policies key authority
  -- on the FIRST folder segment being the tenant's own id. `document_path` arrives from the
  -- browser, so without this a tenant admin could point a signing at another tenant's folder and
  -- have the anon token surface hand that key out, or have a service-role signer mint a URL for
  -- it. The bucket policy cannot catch that: service_role bypasses it. So the row itself refuses.
  CONSTRAINT tas_document_path_is_own_tenant_ck CHECK (
    document_path IS NULL OR document_path LIKE tenant_id::text || '/%'),
  CONSTRAINT tas_signed_path_is_own_tenant_ck CHECK (
    signed_pdf_path IS NULL OR signed_pdf_path LIKE tenant_id::text || '/%')
);

-- The tenant's own list: "what is out for signature right now".
CREATE INDEX IF NOT EXISTS idx_tas_tenant_state
  ON public.tenant_agreement_signings (tenant_id, signature_state);
-- Carries the RLS EXISTS below; without it every visibility check is a sequential scan.
CREATE INDEX IF NOT EXISTS idx_tas_contact   ON public.tenant_agreement_signings (contact_id);
CREATE INDEX IF NOT EXISTS idx_tas_agreement ON public.tenant_agreement_signings (agreement_id)
  WHERE agreement_id IS NOT NULL;

-- Dropped first so the whole file is re-runnable. That is not tidiness: the proof beside it
-- applies this migration inside BEGIN/ROLLBACK against a database that may already carry it, and
-- a bare CREATE TRIGGER would abort the proof on the one database where it matters most.
DROP TRIGGER IF EXISTS tas_set_updated_at ON public.tenant_agreement_signings;
CREATE TRIGGER tas_set_updated_at BEFORE UPDATE ON public.tenant_agreement_signings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

COMMENT ON TABLE public.tenant_agreement_signings IS
  'One document sent to one client to sign, and what became of it. Signature state only: it never '
  'writes tenant_client_agreements.status, and records no payment, invoice, provider '
  'subscription or authorisation (§38). The raw link token is never stored, only its SHA-256.';

-- ─── RLS: A SIGNING IS AS VISIBLE AS ITS CLIENT, AND NO MORE ─────────────────────────────────
--
-- The asymmetry this avoids is the one the agreement table already documents: a table keyed only
-- on `tenant_id = current_user_tenant_id()`, with no role predicate, lets any active member read
-- every row — while `clients` gives that same member ZERO rows. They would see a signed contract
-- naming a client id and an amount and be unable to resolve who it is. So the same two-policy
-- shape is used here: a hard tenant gate that cannot be argued with, plus visibility inherited
-- from the client the signing names.
--
-- WHAT INHERITING ALSO INHERITS, stated rather than glossed (§13): `clients_admins_full` keys on
-- `has_any_role(auth.uid(), ARRAY['admin','super_admin'])`, and `user_roles` has no tenant
-- column, so a person who is admin of ANY tenant and merely a member of another can read that
-- other tenant's client book. That is a `clients`-owned defect, recorded at
-- 20261200000000:220-228, and it is not widened from here — the RESTRICTIVE gate below still
-- requires the row's tenant to be the caller's ACTIVE one.
--
-- FUTURE CONSTRAINT, recorded because it is real: if `clients` ever gains a policy referencing
-- `tenant_agreement_signings`, Postgres will error on mutual recursion. The dependency is
-- one-directional by design and must stay that way.
ALTER TABLE public.tenant_agreement_signings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tas_tenant_isolation ON public.tenant_agreement_signings;
CREATE POLICY tas_tenant_isolation ON public.tenant_agreement_signings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- PERMISSIVE, SELECT only. The EXISTS is evaluated under the CALLER's own RLS on `clients`, so
-- that table's policies apply here with no restatement and therefore no drift.
--
-- The restrictive policy above is what makes this safe rather than clever: `clients` carries
-- `clients_linked_self_read` (`linked_user_id = auth.uid()`), so a naive EXISTS alone would have
-- granted every PORTAL CLIENT read access to their own signing row — including `token_hash`,
-- which is the one column in this table that must never be readable by anyone. A portal client is
-- not in `tenant_members`, so `current_user_tenant_id()` does not resolve to this tenant and the
-- restrictive gate refuses first.
DROP POLICY IF EXISTS tas_visible_with_its_client ON public.tenant_agreement_signings;
CREATE POLICY tas_visible_with_its_client ON public.tenant_agreement_signings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = contact_id));

-- No INSERT/UPDATE/DELETE policy exists, on purpose: the DEFINER functions below and the
-- service-role signing function are the ONLY writers, so there is no second write path for a
-- producer inventory to miss (§37). anon never touches the TABLE — only the two token RPCs.
REVOKE ALL ON TABLE public.tenant_agreement_signings FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_agreement_signings FROM anon;
GRANT SELECT ON TABLE public.tenant_agreement_signings TO authenticated;

-- ─── THE LINKS MUST RESOLVE INSIDE THE ROW'S OWN TENANT ──────────────────────────────────────
--
-- `contact_id uuid NOT NULL REFERENCES public.clients(id)` proves the client EXISTS. It does not
-- prove the client is YOURS, and those are different facts. The RPC below proves ownership — but
-- the RPC is not the only writer. The signing edge function runs as `service_role`, bypasses RLS
-- entirely, and is precisely the caller §10 requires this seam to keep open. So the tenancy proof
-- lives in the database, where every writer meets it, rather than only in the one writer that
-- happens to be a person clicking.
--
-- The consequence of leaving it to the RPC alone is not hypothetical: a row with `tenant_id = A`
-- against a client of tenant B is invisible to EVERY normal caller — including A's own owner,
-- because the read policy asks whether the CLIENT is visible and that client belongs to someone
-- else — while still holding a unique token_hash. Silent dark data with a live link attached.
CREATE OR REPLACE FUNCTION public.enforce_signing_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = NEW.contact_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that client belongs to a different workspace' USING ERRCODE = '42501';
  END IF;
  IF NEW.agreement_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_client_agreements a
                      WHERE a.id = NEW.agreement_id AND a.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that agreement belongs to a different workspace' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_signing_tenant_links ON public.tenant_agreement_signings;
CREATE TRIGGER trg_signing_tenant_links
  BEFORE INSERT OR UPDATE ON public.tenant_agreement_signings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_signing_tenant_links();

-- A trigger function is only ever invoked by its trigger, but SECURITY DEFINER inherits
-- PostgreSQL's default `EXECUTE TO PUBLIC`, so it is revoked rather than left to inertness.
REVOKE ALL ON FUNCTION public.enforce_signing_tenant_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_signing_tenant_links() FROM anon;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
--  TENANT SIDE — three writers, one guard preamble, copied not improvised
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- The preamble is lifted verbatim in SHAPE and ORDER from `save_client_agreement`
-- (20261200000000:388-422), because each step is there for a reason that is not obvious from the
-- step itself:
--
--   1. session-resolved actor and tenant, both required;
--   2. the expected tenant REFUSES on disagreement and never redirects — a workspace switch
--      writes `profiles.active_tenant_id` before the browser catches up, and a signing drafted
--      against one workspace must never land in another the same person also belongs to. The
--      caller must send the tenant THE FORM WAS OPENED AGAINST; sending the current one makes the
--      guard unable to fire because the caller keeps agreeing with itself;
--   3. authority is settled BEFORE any id is resolved, so a refusal is never a client-directory
--      oracle for a workspace the caller was not entitled to ask about;
--   4. every browser-supplied id is re-checked with `AND x.tenant_id = _tenant`. SECURITY DEFINER
--      bypasses RLS, so those predicates are the only thing standing between this and a foreign
--      tenant's client. They are not decorative, and the proof beside this file demonstrates the
--      hole with each of them removed.

CREATE OR REPLACE FUNCTION public.create_agreement_signing(
  _expected_tenant_id uuid,
  _contact_id         uuid,
  _agreement_id       uuid DEFAULT NULL,   -- NULL is legal: an NDA has no offer and no price
  _document_title     text DEFAULT NULL,
  _document_source    text DEFAULT NULL,
  _document_body      text DEFAULT NULL,
  _document_path      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row    public.tenant_agreement_signings;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may send an agreement to a client for signature'
      USING ERRCODE = '42501';
  END IF;

  -- ── THE IDOR SURFACE. Both ids came from the browser. ─────────────────────────────────────
  PERFORM 1 FROM public.clients c WHERE c.id = _contact_id AND c.tenant_id = _tenant;
  IF NOT FOUND THEN
    -- One sentence for "absent" and "not yours" alike. Telling them apart is the oracle.
    RAISE EXCEPTION 'that client is not in this workspace';
  END IF;

  IF _agreement_id IS NOT NULL THEN
    PERFORM 1 FROM public.tenant_client_agreements a
     WHERE a.id = _agreement_id AND a.tenant_id = _tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'that agreement is not in this workspace';
    END IF;
  END IF;

  -- ── VALIDATION, so no constraint name ever reaches a person ───────────────────────────────
  _document_title  := nullif(btrim(coalesce(_document_title, '')), '');
  _document_source := nullif(btrim(coalesce(_document_source, '')), '');
  _document_body   := nullif(btrim(coalesce(_document_body, '')), '');
  _document_path   := nullif(btrim(coalesce(_document_path, '')), '');

  IF _document_title IS NULL THEN
    RAISE EXCEPTION 'give this document a title the client will recognise';
  END IF;
  IF _document_source IS NULL
     OR _document_source NOT IN ('tenant_upload','paige_draft','tenant_template') THEN
    RAISE EXCEPTION 'say where this document came from: an upload, a Paige draft, or one of your templates';
  END IF;
  IF _document_body IS NULL AND _document_path IS NULL THEN
    RAISE EXCEPTION 'a signing needs the wording: either the text itself or the file it lives in';
  END IF;

  -- Said in words before the CHECK can answer with its own name. The bucket's policies key
  -- authority on the first folder segment, so a file outside this workspace's folder is not this
  -- workspace's file no matter who uploaded it.
  IF _document_path IS NOT NULL AND _document_path NOT LIKE _tenant::text || '/%' THEN
    RAISE EXCEPTION 'that file is not stored in this workspace''s own folder';
  END IF;

  INSERT INTO public.tenant_agreement_signings
    (tenant_id, contact_id, agreement_id, document_title, document_source,
     document_body, document_path, signature_state, created_by)
  VALUES
    (_tenant, _contact_id, _agreement_id, _document_title, _document_source,
     _document_body, _document_path, 'draft', _actor)
  RETURNING * INTO _row;

  -- Read back off the written row (§13), so a value the database normalised can never be echoed
  -- back as though it had been stored as sent.
  RETURN jsonb_build_object(
    'signing_id',      _row.id,
    'signature_state', _row.signature_state);
END;
$function$;

-- ─── THE LINK ────────────────────────────────────────────────────────────────────────────────
--
-- Split from the creator for the reason `set_client_agreement_status` is split from
-- `save_client_agreement`: different preconditions. Drafting a document asserts nothing; handing
-- out a credential that lets an unauthenticated person bind the business does.
--
-- THE RAW TOKEN EXISTS IN EXACTLY ONE PLACE AND FOR EXACTLY ONE MOMENT. It is generated here
-- from 32 cryptographically-random bytes, returned once, and never written anywhere — only its
-- SHA-256 is stored. Re-issuing ROTATES it: the previous hash is overwritten, so the old link is
-- dead the instant a new one is minted, which is the behaviour a person expects from "resend"
-- and is not what they would get if the old hash were kept alongside.
CREATE OR REPLACE FUNCTION public.issue_agreement_signing_link(
  _expected_tenant_id uuid,
  _signing_id         uuid,
  _ttl_days           integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor   uuid := auth.uid();
  _tenant  uuid := public.current_user_tenant_id();
  _state   text;
  _token   text;
  _expires timestamptz;
  _row     public.tenant_agreement_signings;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may send an agreement to a client for signature'
      USING ERRCODE = '42501';
  END IF;

  -- A link with no life, or one that never ends, are both wrong in the same way: the expiry is
  -- the only thing that makes a leaked link stop mattering.
  _ttl_days := coalesce(_ttl_days, 14);
  IF _ttl_days < 1 OR _ttl_days > 90 THEN
    RAISE EXCEPTION 'a signing link lasts between a day and ninety days';
  END IF;

  SELECT signature_state INTO _state FROM public.tenant_agreement_signings
   WHERE id = _signing_id AND tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that signing is not in this workspace';
  END IF;

  -- Deliberately narrow. A completed signing must not be re-openable — that would let a link
  -- outlive the signature it produced — and a declined or voided one is a decision, not a draft.
  IF _state NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'this signing is already %; start a new one rather than re-sending this link', _state;
  END IF;

  _token   := encode(extensions.gen_random_bytes(32), 'hex');
  _expires := now() + make_interval(days => _ttl_days);

  UPDATE public.tenant_agreement_signings
     SET token_hash      = encode(extensions.digest(_token, 'sha256'), 'hex'),
         expires_at      = _expires,
         signature_state = 'sent',
         sent_at         = now()
   WHERE id = _signing_id AND tenant_id = _tenant
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'that signing is not in this workspace';
  END IF;

  -- The ONLY time the raw token is ever in the response, and it is never in the row.
  RETURN jsonb_build_object(
    'signing_id', _row.id,
    'token',      _token,
    'expires_at', _row.expires_at);
END;
$function$;

-- ─── VOIDING ─────────────────────────────────────────────────────────────────────────────────
--
-- Voiding NULLs the token_hash, and that is the whole point of it. A void that only changed a
-- label would leave the link working: the client opens the mail they were sent, signs, and the
-- business finds out it withdrew a document that somebody then executed. The link has to actually
-- stop working, and NULLing the hash is what makes it stop — there is no stored value left for an
-- incoming token to match.
CREATE OR REPLACE FUNCTION public.void_agreement_signing(
  _expected_tenant_id uuid,
  _signing_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _state  text;
  _row    public.tenant_agreement_signings;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may withdraw an agreement from signature'
      USING ERRCODE = '42501';
  END IF;

  SELECT signature_state INTO _state FROM public.tenant_agreement_signings
   WHERE id = _signing_id AND tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that signing is not in this workspace';
  END IF;

  -- A completed signing is EVIDENCE. Voiding it would relabel a document somebody signed, which
  -- is the one edit this table must never make; ending the arrangement is the agreement's job,
  -- not the signature's.
  IF _state = 'completed' THEN
    RAISE EXCEPTION 'this has already been signed; voiding it would rewrite what the client agreed to';
  END IF;

  UPDATE public.tenant_agreement_signings
     SET signature_state = 'voided',
         voided_at       = now(),
         token_hash      = NULL   -- the link stops working, rather than merely being relabelled
   WHERE id = _signing_id AND tenant_id = _tenant
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'that signing is not in this workspace';
  END IF;

  RETURN jsonb_build_object(
    'signing_id',      _row.id,
    'signature_state', _row.signature_state,
    'voided_at',       _row.voided_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_agreement_signing(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agreement_signing(uuid, uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_agreement_signing(uuid, uuid, uuid, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.issue_agreement_signing_link(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_agreement_signing_link(uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_agreement_signing_link(uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.void_agreement_signing(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_agreement_signing(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_agreement_signing(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_agreement_signing(uuid, uuid, uuid, text, text, text, text) IS
  'Records a document to be sent to one client for signature. Creates no link and no token; '
  'the signing starts in draft. agreement_id is optional by owner ruling — an NDA has no offer.';
COMMENT ON FUNCTION public.issue_agreement_signing_link(uuid, uuid, integer) IS
  'Mints the single-use signing link. The raw token is generated server-side, returned exactly '
  'once and NEVER stored; only its SHA-256 is kept. Re-issuing rotates it and kills the old link.';
COMMENT ON FUNCTION public.void_agreement_signing(uuid, uuid) IS
  'Withdraws a signing and NULLs its token hash, so the link that was sent genuinely stops '
  'working rather than merely being relabelled. Refuses on a completed signing.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
--  ANON SIDE — the token is the whole credential, so the token is the whole input
-- ═════════════════════════════════════════════════════════════════════════════════════════════
--
-- definer-anon-exempt (restated here beside the grants it covers; the marker at the top of this
-- file is what the CI lint reads, and it exempts the FILE — the three tenant-side functions above
-- are nonetheless granted to `authenticated` ONLY, and never to anon).
--
-- WHAT MAKES THIS SAFE, stated as the properties a reviewer can check rather than as a claim:
--
--   · It accepts NO tenant, contact or agreement id. Ever. Everything is derived from the row the
--     token hashes to, so there is nothing for a caller to substitute.
--   · It returns NO tenant_id, no contact_id, no staff address, no agreement id, and no second
--     row. The cautionary tale is on this platform's own record: `resolveHostNames` leaked staff
--     identity through a public surface (`docs/doctrine/tier-matrix.md:389`). Brand comes from
--     `resolve_tenant_brand()` and only brand fields are copied out of it — `peek_tenant_invite`
--     returns `tenant_id` from that same resolver and this one deliberately does not.
--   · Bad, expired, already-completed, declined, voided and unknown tokens are INDISTINGUISHABLE:
--     every one returns zero rows. Not a different message, not a different field, not a
--     different latency class — the same empty result. A holder of a guessed token learns nothing
--     about whether it named anything.
--
-- `is_valid` is therefore ALWAYS true on any row this returns, and that is not a redundancy to be
-- optimised away: the column keeps the shape a caller already knows from `peek_tenant_invite`,
-- and it is true precisely BECAUSE the invalid cases return nothing instead of `is_valid=false`.
-- `peek_tenant_invite` takes the other route and can be probed for the existence of an expired
-- invite; this one cannot.
CREATE OR REPLACE FUNCTION public.peek_agreement_signing(_token text)
RETURNS TABLE (
  document_title      text,
  document_body       text,
  document_path       text,
  business_name       text,
  brand               jsonb,
  signer_display_name text,
  amount_minor        bigint,
  amount_currency     text,
  term_summary        text,
  expires_at          timestamptz,
  signature_state     text,
  is_valid            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _hash text;
  _sig  public.tenant_agreement_signings;
  _cli  public.clients;
  _agr  public.tenant_client_agreements;
  _rb   record;
BEGIN
  _token := nullif(btrim(coalesce(_token, '')), '');
  IF _token IS NULL THEN
    RETURN;   -- the same nothing every other refusal returns
  END IF;

  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');

  -- The lookup is by HASH, never by id, and `token_hash` is NULL on every terminal row, so a
  -- voided, declined or completed signing cannot be found here at all — the link is gone, not
  -- merely refused.
  SELECT * INTO _sig FROM public.tenant_agreement_signings WHERE token_hash = _hash;
  IF _sig.id IS NULL THEN
    RETURN;
  END IF;

  -- An expired link is recorded as expired rather than left saying 'Sent' forever on the tenant's
  -- own list. The write is bounded to the single row whose token already matched, and it changes
  -- NOTHING about what is returned: the caller still gets the same empty result as a bad token.
  IF _sig.expires_at IS NULL OR _sig.expires_at <= now() THEN
    IF _sig.signature_state IN ('sent','viewed') THEN
      UPDATE public.tenant_agreement_signings
         SET signature_state = 'expired'
       WHERE id = _sig.id;
    END IF;
    RETURN;
  END IF;

  IF _sig.signature_state NOT IN ('sent','viewed') THEN
    RETURN;
  END IF;

  -- First open. `viewed_at` is set once and never moved, because "when did they first see it" is
  -- the question a dispute asks; "when did they last refresh" is not.
  IF _sig.signature_state = 'sent' THEN
    UPDATE public.tenant_agreement_signings
       SET signature_state = 'viewed', viewed_at = coalesce(viewed_at, now())
     WHERE id = _sig.id
    RETURNING * INTO _sig;
  END IF;

  SELECT * INTO _cli FROM public.clients WHERE id = _sig.contact_id;
  IF _sig.agreement_id IS NOT NULL THEN
    SELECT * INTO _agr FROM public.tenant_client_agreements WHERE id = _sig.agreement_id;
  END IF;
  SELECT * INTO _rb FROM public.resolve_tenant_brand(_sig.tenant_id);

  document_title := _sig.document_title;
  document_body  := _sig.document_body;
  document_path  := _sig.document_path;

  -- The business as the CLIENT knows it, which is the branded name where one is set and the
  -- workspace name otherwise. `_rb.tenant_id` is read from the same record and deliberately
  -- dropped on the floor.
  business_name := coalesce(nullif(btrim(coalesce(_rb.product_name, '')), ''), _rb.tenant_name);
  brand := jsonb_build_object(
             'logo_url',      _rb.logo_url,
             'logo_dark_url', _rb.logo_dark_url,
             'primary_color', _rb.primary_color,
             'accent_color',  _rb.accent_color,
             'font',          _rb.font);

  -- The signer's own name, shown back to them so they can see the document is addressed to them.
  -- No email, no phone, no internal note, no client id — the name and nothing else.
  signer_display_name := nullif(btrim(concat_ws(' ', _cli.first_name, _cli.last_name)), '');

  -- DESCRIPTIVE ONLY (§38). This is what the document says they agreed to pay; nothing in this
  -- path charges, authorises, schedules or collects it, and there is no card field anywhere on
  -- this surface. Null throughout when the signing has no agreement — an NDA has no price, and a
  -- zero would read as "free" rather than as "not applicable".
  amount_minor    := _agr.agreed_amount_minor;
  amount_currency := _agr.agreed_currency;
  term_summary := CASE _agr.term_kind
    WHEN 'one_time'     THEN 'One-time'
    WHEN 'recurring'    THEN 'Every ' ||
      CASE WHEN coalesce(_agr.interval_count, 1) = 1 THEN ''
           ELSE _agr.interval_count::text || ' ' END || _agr.billing_interval ||
      CASE WHEN coalesce(_agr.interval_count, 1) = 1 THEN '' ELSE 's' END
    WHEN 'installment'  THEN _agr.installments_total::text || ' instalments'
    WHEN 'deposit'      THEN 'Deposit'
    WHEN 'custom_quote' THEN 'Custom arrangement'
    ELSE NULL
  END;

  expires_at      := _sig.expires_at;
  signature_state := _sig.signature_state;
  is_valid        := true;
  RETURN NEXT;
END;
$function$;

-- ─── DECLINING ───────────────────────────────────────────────────────────────────────────────
--
-- The signer's own exit. It NULLs the token_hash for the same reason voiding does: a declined
-- document must not be re-openable by whoever else has the mail, including the person who
-- declined it changing their mind privately. Deciding again means being sent a new link.
--
-- `{"ok": false}` is returned for EVERY invalid token — unknown, expired, already decided — and
-- it is the same value in each case, so this cannot be used to learn whether a token named
-- anything. `{"ok": true}` is only reachable by a holder of a live link, who already knows it.
CREATE OR REPLACE FUNCTION public.decline_agreement_signing(_token text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _hash text;
  _sig  public.tenant_agreement_signings;
BEGIN
  _token := nullif(btrim(coalesce(_token, '')), '');
  IF _token IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');

  UPDATE public.tenant_agreement_signings
     SET signature_state = 'declined',
         declined_at     = now(),
         decline_reason  = nullif(btrim(coalesce(_reason, '')), ''),
         token_hash      = NULL
   WHERE token_hash = _hash
     AND signature_state IN ('sent','viewed')
     AND expires_at > now()
  RETURNING * INTO _sig;

  IF _sig.id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- definer-anon-exempt: see the file header. These two ARE the pre-auth signing surface; both are
-- token-derived, return no tenant_id and no staff identity, and answer every invalid token with
-- the same empty result.
REVOKE ALL ON FUNCTION public.peek_agreement_signing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_agreement_signing(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.decline_agreement_signing(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_agreement_signing(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.peek_agreement_signing(text) IS
  'The unauthenticated signing view, derived entirely from the link token. Returns the document '
  'and the sending business''s brand, and NEVER tenant_id, a staff address or another row. Bad, '
  'expired, completed, declined, voided and unknown tokens all return the same empty result.';
COMMENT ON FUNCTION public.decline_agreement_signing(text, text) IS
  'The signer declines. NULLs the token hash so the link stops working. Returns the same '
  '{"ok": false} for every invalid token, so it cannot be used to probe for one.';
