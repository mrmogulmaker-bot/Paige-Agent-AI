-- ============================================================================
-- INT-163 — the Agreements engine, slice 1: the records.
--
-- WHAT THIS PR IS. PAIGE's OWN e-signature lifecycle: a tenant sends a document to an external
-- counterparty, that person signs it, and the completed file is sealed and retained. No signing
-- vendor is called at any point. The DocuSign functions keep working and are untouched by this.
--
-- WHY A NEW HOME AND NOT AN EXISTING ONE (§18 — searched before scaffolding). Four tables already
-- carry the word "agreement" and NOT ONE of them is this:
--   · public.paige_signed_agreements   — the /onboard wizard's consumer signing record. Keyed to
--     clients.id with NO tenant_id, no status, no signer, no send. It is one authenticated client
--     accepting one fixed onboarding template in-app. Untouched here.
--   · public.tenant_client_agreements  — COMMERCIAL TERMS (amount, cadence, retainer state). Its
--     own migration says it outright: "recording terms is not signing a document." This engine
--     LINKS to it (commercial_terms_id) and replaces nothing in it.
--   · public.agreement_templates / public.tenant_agreement_versions — the template LIBRARY. It
--     authors bodies and has never produced a signature. This engine READS it as a body source.
--   · public.legal_acceptances        — platform click-accept of Paige's own terms. Different
--     direction entirely (tenant→Paige, not tenant→their client).
-- And public.paige_signature_envelopes is the DocuSign mirror. We do not extend it, and the word
-- "envelope" is the vendor's — it appears nowhere in this engine's vocabulary. Ours is: agreement,
-- signer, signed, completed.
--
-- THE SECURITY POSTURE THIS TABLE EXISTS TO NOT REPEAT (§9). docusign-send-envelope takes
-- contact_id off the REQUEST BODY and resolves it against public.clients with the SERVICE-ROLE
-- client and no tenant filter, behind a requireAdmin that gates on the tenant-blind has_role() over
-- public.user_roles. Any global admin of any tenant can therefore read any client row by uuid. That
-- function is out of scope here and is deliberately not modified — but nothing below reproduces the
-- shape: every tenant link is re-proved IN THE DATABASE by trg_agreement_tenant_links, which fires
-- for the service role too, so a caller-supplied id that belongs to another workspace fails 42501
-- no matter which client opened the connection.
--
-- WRITE-ONCE IS A TRIGGER, NOT A POLICY. RLS does not bind the service role, and the service role
-- is the only writer here. A "sealed documents are immutable" rule expressed as a policy would
-- therefore be decorative. trg_agreement_seal_immutable and trg_agreement_events_append_only are
-- BEFORE triggers, which DO fire for the service role, so the retained legal record cannot be
-- rewritten by the code that wrote it.
--
-- WHAT THIS MIGRATION DOES NOT DO. It sends nothing, mints no token, calls no provider, and touches
-- no existing table or policy. Slice 2 adds the send, the signing ceremony and the sealing; slice 3
-- adds notifications and the Paige tools.
--
-- ROLLBACK (forward-only production procedure): this migration is additive — three new tables, one
-- new private bucket, and their own triggers/policies. To reverse, write a FORWARD migration that
-- drops public.paige_agreement_events, public.paige_agreement_signers and public.paige_agreements
-- (in that order, they cascade by FK) and the agreement-document storage policies. Do not delete or
-- edit this file once applied; the ledger is keyed on the version alone.
-- ============================================================================

-- ── 1) The agreement — one document, one counterparty, one lifecycle ────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOT NULL: every §9 predicate below keys on it, and the isolation policy has no NULL escape.
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- The counterparty this document is with. RESTRICT, not CASCADE: deleting a client who has a
  -- signed legal document must fail loudly rather than silently destroying the retained record.
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,

  -- OPTIONAL links. An agreement may stand alone, or point at what it is an agreement ABOUT.
  -- Neither is a source of truth for this row; both are re-proved same-tenant by the trigger below.
  offer_id uuid REFERENCES public.tenant_products(id) ON DELETE SET NULL,
  commercial_terms_id uuid REFERENCES public.tenant_client_agreements(id) ON DELETE SET NULL,

  title text NOT NULL CHECK (btrim(title) <> ''),

  -- WHERE THE BODY CAME FROM. 'inline' is text the tenant (or Paige) authored for this agreement.
  -- 'tenant_agreement_version' is the existing template library; source_version_id then names the
  -- exact row, so the retained record can always say which version was presented.
  body_source text NOT NULL DEFAULT 'inline'
    CHECK (body_source IN ('inline','tenant_agreement_version')),
  source_version_id uuid REFERENCES public.tenant_agreement_versions(id) ON DELETE SET NULL,
  body_markdown text NOT NULL CHECK (btrim(body_markdown) <> ''),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','partially_signed','completed','declined','voided','expired')),

  -- Bumped every time a DRAFT body is edited, so an audit row can say which revision it refers to.
  -- Frozen with the rest of the document at send.
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),

  -- ── THE TWO HASHES (ESIGN integrity) ──────────────────────────────────────────────────────────
  -- content_*: the EXACT bytes presented to the signer, frozen at send. Hashed AFTER rendering, so
  -- the hash covers what was actually shown and not the markdown it came from.
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  content_storage_key text,
  -- sealed_*: the completed file — signatures stamped in, certificate of completion appended — then
  -- hashed. Written exactly once, enforced by trigger.
  sealed_sha256 text CHECK (sealed_sha256 IS NULL OR sealed_sha256 ~ '^[0-9a-f]{64}$'),
  sealed_storage_key text,

  sent_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  -- When the whole agreement stops being signable. Signer tokens carry their own expiry too; the
  -- earlier of the two wins at the endpoint.
  expires_at timestamptz,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A sent document must carry the frozen bytes it was sent as. This is what makes "the signer saw
  -- exactly this" checkable later rather than asserted.
  CONSTRAINT pa_sent_is_frozen_ck CHECK (
    status = 'draft' OR status = 'voided'
    OR (content_sha256 IS NOT NULL AND content_storage_key IS NOT NULL)
  ),
  CONSTRAINT pa_completed_is_sealed_ck CHECK (
    status <> 'completed' OR (sealed_sha256 IS NOT NULL AND sealed_storage_key IS NOT NULL)
  ),
  CONSTRAINT pa_source_version_only_for_library_ck CHECK (
    body_source = 'tenant_agreement_version' OR source_version_id IS NULL
  )
);

COMMENT ON TABLE public.paige_agreements IS
  'INT-163: PAIGE-native e-signature lifecycle (agreement -> signer -> signed -> completed). Not tenant_client_agreements (commercial terms), not paige_signed_agreements (onboarding wizard), not paige_signature_envelopes (DocuSign mirror).';

CREATE INDEX IF NOT EXISTS idx_paige_agreements_tenant_status
  ON public.paige_agreements (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paige_agreements_contact
  ON public.paige_agreements (contact_id);
-- The expiry sweep reads exactly this: live agreements whose time has run out.
CREATE INDEX IF NOT EXISTS idx_paige_agreements_expiry
  ON public.paige_agreements (expires_at)
  WHERE status IN ('sent','viewed','partially_signed');

-- ── 2) The signers — one row per person who must sign ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_agreement_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.paige_agreements(id) ON DELETE CASCADE,

  -- Denormalised so RLS and the rate limiter can scope without a join. Kept honest by the trigger.
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  full_name text NOT NULL CHECK (btrim(full_name) <> ''),
  email text NOT NULL CHECK (position('@' in email) > 1),
  signer_role text NOT NULL DEFAULT 'counterparty'
    CHECK (signer_role IN ('counterparty','tenant_signatory','witness')),
  signing_order integer NOT NULL DEFAULT 1 CHECK (signing_order >= 1),

  -- ── THE ACCESS TOKEN — stored ONLY as a hash ──────────────────────────────────────────────────
  -- The plaintext is 32 random bytes (256 bits), emitted once into the signer's email and never
  -- persisted, logged or returned. A leaked database therefore yields no working signing link.
  -- Same shape as email_unsubscribe_tokens.token_hash, which is the proven precedent here.
  token_hash text UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  token_revoked_at timestamptz,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','viewed','signed','declined')),

  -- ── ESIGN evidence ────────────────────────────────────────────────────────────────────────────
  -- Affirmative consent to do business electronically. The disclosure the signer was shown is
  -- stored by hash so the retained record can prove WHICH text they agreed to, not merely that a
  -- box was ticked. NULL means they were never asked — never "they agreed".
  -- The disclosure is identified AND hashed. "They ticked a box" is unfalsifiable two years later,
  -- when the wording has changed four times; the slug+version says which text, and the hash proves
  -- that text was not edited underneath the record afterwards. A disclosure is never edited in
  -- place — a new version is a new row in the constant table, and old records keep pointing at what
  -- they actually showed.
  esign_consent_at timestamptz,
  esign_consent_slug text,
  esign_consent_version integer CHECK (esign_consent_version IS NULL OR esign_consent_version >= 1),
  esign_consent_sha256 text CHECK (esign_consent_sha256 IS NULL OR esign_consent_sha256 ~ '^[0-9a-f]{64}$'),

  -- Intent to sign: the name they typed, and the mark they drew if they drew one.
  typed_name text,
  signature_image_key text,

  first_viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,

  -- Attribution evidence. This links the act to a network origin and a client, which — together
  -- with possession of a 256-bit token sent to that address — is what we can honestly capture. It
  -- is NOT proof of personal identity, and no surface may describe it as such.
  signing_ip inet,
  signing_user_agent text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One person is asked once per agreement.
  CONSTRAINT pas_unique_email_per_agreement UNIQUE (agreement_id, email),
  -- A token with no expiry is a link that works forever. The column is nullable because a signer
  -- exists before one is minted; what must never exist is a MINTED token with no expiry, so the two
  -- are tied together here rather than left to whichever code path happens to set them.
  CONSTRAINT pas_token_needs_expiry_ck CHECK (
    token_hash IS NULL OR token_expires_at IS NOT NULL
  ),
  -- A signature without recorded consent is not a conformant record, so the database refuses it.
  CONSTRAINT pas_signed_needs_consent_ck CHECK (
    status <> 'signed'
    OR (signed_at IS NOT NULL AND esign_consent_at IS NOT NULL
        AND esign_consent_sha256 IS NOT NULL AND esign_consent_slug IS NOT NULL
        AND esign_consent_version IS NOT NULL AND btrim(coalesce(typed_name,'')) <> '')
  ),
  -- Consent comes BEFORE the signature, or the consent was not to this act. Enforced here rather
  -- than in the handler because a retry or a direct call would otherwise invert it silently.
  CONSTRAINT pas_consent_precedes_signature_ck CHECK (
    signed_at IS NULL OR esign_consent_at IS NULL OR signed_at >= esign_consent_at
  )
);

COMMENT ON COLUMN public.paige_agreement_signers.token_hash IS
  'SHA-256 of a 256-bit access token. The plaintext exists only in the signer''s email; it is never stored, logged or returned.';
COMMENT ON COLUMN public.paige_agreement_signers.signing_ip IS
  'Attribution evidence, not identity proof. Records where the signing request came from; it does not establish who the person is.';

CREATE INDEX IF NOT EXISTS idx_paige_agreement_signers_agreement
  ON public.paige_agreement_signers (agreement_id, signing_order);
CREATE INDEX IF NOT EXISTS idx_paige_agreement_signers_tenant
  ON public.paige_agreement_signers (tenant_id);
-- The public endpoint's only lookup. Partial: a revoked or never-issued token is not a live link.
CREATE INDEX IF NOT EXISTS idx_paige_agreement_signers_token
  ON public.paige_agreement_signers (token_hash)
  WHERE token_hash IS NOT NULL AND token_revoked_at IS NULL AND token_expires_at IS NOT NULL;

-- ── 3) The audit trail — append-only, and enforced as such ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_agreement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.paige_agreements(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  signer_id uuid REFERENCES public.paige_agreement_signers(id) ON DELETE SET NULL,

  event_type text NOT NULL CHECK (event_type IN (
    'created','edited','sent','delivered','viewed','consented','signed',
    'declined','completed','voided','expired','sealed','downloaded','resent'
  )),

  -- Who caused it. 'signer' is the external counterparty (no platform account), 'owner' a tenant
  -- user, 'paige' her acting on the owner's confirmed instruction, 'system' an unattended sweep.
  actor_kind text NOT NULL CHECK (actor_kind IN ('owner','signer','paige','system')),
  actor_user_id uuid,
  actor_email text,

  ip inet,
  user_agent text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paige_agreement_events IS
  'Append-only audit trail for the agreements engine. UPDATE and DELETE are refused by trigger, for the service role too.';

CREATE INDEX IF NOT EXISTS idx_paige_agreement_events_agreement
  ON public.paige_agreement_events (agreement_id, created_at);
CREATE INDEX IF NOT EXISTS idx_paige_agreement_events_tenant
  ON public.paige_agreement_events (tenant_id, created_at DESC);

-- ── 4) The §9 gate that binds the service role too ──────────────────────────────────────────────
-- Every foreign id on an agreement is re-proved to belong to the SAME workspace, in the database,
-- on every insert and update. This is the control that makes a caller-supplied id safe: it does not
-- matter whether the connection used the anon key, a member's JWT or the service role — a row that
-- points across a tenant boundary cannot be written at all.
CREATE OR REPLACE FUNCTION public.enforce_agreement_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = NEW.contact_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that client belongs to a different workspace' USING ERRCODE = '42501';
  END IF;

  IF NEW.offer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_products p
                      WHERE p.id = NEW.offer_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that offer belongs to a different workspace' USING ERRCODE = '42501';
  END IF;

  IF NEW.commercial_terms_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_client_agreements a
                      WHERE a.id = NEW.commercial_terms_id
                        AND a.tenant_id = NEW.tenant_id
                        AND a.contact_id = NEW.contact_id) THEN
    RAISE EXCEPTION 'those commercial terms belong to a different workspace or a different client'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.source_version_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_agreement_versions v
                      WHERE v.id = NEW.source_version_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that agreement template belongs to a different workspace' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_tenant_links() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_tenant_links ON public.paige_agreements;
CREATE TRIGGER trg_agreement_tenant_links
  BEFORE INSERT OR UPDATE ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_tenant_links();

-- A signer's denormalised tenant must equal its agreement's. Without this the column is a lie the
-- RLS policies would then trust.
CREATE OR REPLACE FUNCTION public.enforce_agreement_signer_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE _parent uuid;
BEGIN
  SELECT tenant_id INTO _parent FROM public.paige_agreements WHERE id = NEW.agreement_id;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'that agreement does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM _parent THEN
    RAISE EXCEPTION 'a signer cannot belong to a different workspace than its agreement'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_signer_tenant() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_signer_tenant ON public.paige_agreement_signers;
CREATE TRIGGER trg_agreement_signer_tenant
  BEFORE INSERT OR UPDATE ON public.paige_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_signer_tenant();

-- An audit row carries the workspace it is evidence for, and that workspace is not the writer's to
-- choose. Without this an events insert is the one write in the engine where a service-role caller
-- could file an event against the wrong tenant — and because the trail is append-only, a wrong row
-- here can never be corrected.
CREATE OR REPLACE FUNCTION public.enforce_agreement_event_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE _parent uuid;
BEGIN
  SELECT tenant_id INTO _parent FROM public.paige_agreements WHERE id = NEW.agreement_id;
  IF _parent IS NULL THEN
    RAISE EXCEPTION 'that agreement does not exist' USING ERRCODE = '23503';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM _parent THEN
    RAISE EXCEPTION 'an audit event cannot be filed against a different workspace than its agreement'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.signer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.paige_agreement_signers s
                      WHERE s.id = NEW.signer_id AND s.agreement_id = NEW.agreement_id) THEN
    RAISE EXCEPTION 'that signer is not on this agreement' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_event_scope() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_event_scope ON public.paige_agreement_events;
CREATE TRIGGER trg_agreement_event_scope
  BEFORE INSERT ON public.paige_agreement_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_event_scope();

-- Signing order is a rule about the document, so it lives with the document. A signer holding a
-- valid token from an earlier round could otherwise sign ahead of their turn by calling the endpoint
-- directly, and no amount of care in the handler would stop it.
CREATE OR REPLACE FUNCTION public.enforce_agreement_signing_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE _blocking integer;
BEGIN
  IF NEW.status <> 'signed' OR OLD.status = 'signed' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _blocking
    FROM public.paige_agreement_signers s
   WHERE s.agreement_id = NEW.agreement_id
     AND s.signing_order < NEW.signing_order
     AND s.status <> 'signed';

  IF _blocking > 0 THEN
    RAISE EXCEPTION 'this agreement is waiting on % earlier signer(s) before you can sign', _blocking
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_signing_order() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_signing_order ON public.paige_agreement_signers;
CREATE TRIGGER trg_agreement_signing_order
  BEFORE UPDATE ON public.paige_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_signing_order();

-- A signer's status is one-way too. Without this, only handler code stood between a replayed POST
-- and a second signature — and the service role writes straight past handler code. `signed` and
-- `declined` are final: a person does not un-sign, and the way to re-ask is a new agreement.
CREATE OR REPLACE FUNCTION public.enforce_agreement_signer_status_forward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE _allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  _allowed := CASE OLD.status
    WHEN 'pending' THEN ARRAY['viewed','signed','declined']
    WHEN 'viewed'  THEN ARRAY['signed','declined']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY (_allowed)) THEN
    RAISE EXCEPTION 'a signer cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_signer_status_forward() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_signer_status_forward ON public.paige_agreement_signers;
CREATE TRIGGER trg_agreement_signer_status_forward
  BEFORE UPDATE OF status ON public.paige_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_signer_status_forward();

-- ── 5) The status machine — one-way, terminal states are final ──────────────────────────────────
-- Expressed as data rather than a chain of IFs so the whole machine is readable in one glance and a
-- later reader can see exactly which moves exist. Completed, declined, voided and expired have no
-- outgoing edges: a finished agreement is re-done by creating a new one, never by reopening it.
CREATE OR REPLACE FUNCTION public.enforce_agreement_status_forward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  _allowed := CASE OLD.status
    WHEN 'draft'            THEN ARRAY['sent','voided']
    WHEN 'sent'             THEN ARRAY['viewed','partially_signed','completed','declined','voided','expired']
    WHEN 'viewed'           THEN ARRAY['partially_signed','completed','declined','voided','expired']
    WHEN 'partially_signed' THEN ARRAY['completed','declined','voided','expired']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY (_allowed)) THEN
    RAISE EXCEPTION 'an agreement cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_status_forward() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_status_forward ON public.paige_agreements;
CREATE TRIGGER trg_agreement_status_forward
  BEFORE UPDATE OF status ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_status_forward();

-- ── 6) Write-once on the document of record ─────────────────────────────────────────────────────
-- The frozen bytes and the sealed bytes are each written exactly once. After that they are facts
-- about what a person was shown and what they signed, and nothing in the system may revise them —
-- including the service-role code that wrote them, which is why this is a trigger and not a policy.
CREATE OR REPLACE FUNCTION public.enforce_agreement_seal_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF OLD.content_sha256 IS NOT NULL
     AND (NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
          OR NEW.content_storage_key IS DISTINCT FROM OLD.content_storage_key) THEN
    RAISE EXCEPTION 'the document presented to the signer is frozen and cannot be rewritten'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.sealed_sha256 IS NOT NULL
     AND (NEW.sealed_sha256 IS DISTINCT FROM OLD.sealed_sha256
          OR NEW.sealed_storage_key IS DISTINCT FROM OLD.sealed_storage_key) THEN
    RAISE EXCEPTION 'a sealed agreement is a retained record and cannot be rewritten'
      USING ERRCODE = '23514';
  END IF;

  -- The body and its version are editable only while nobody has been shown them.
  IF OLD.status <> 'draft'
     AND (NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
          OR NEW.title IS DISTINCT FROM OLD.title
          OR NEW.version IS DISTINCT FROM OLD.version
          OR NEW.body_source IS DISTINCT FROM OLD.body_source
          OR NEW.source_version_id IS DISTINCT FROM OLD.source_version_id) THEN
    RAISE EXCEPTION 'this agreement has already been sent; its contents can no longer be edited'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_seal_immutable() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_seal_immutable ON public.paige_agreements;
CREATE TRIGGER trg_agreement_seal_immutable
  BEFORE UPDATE ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_seal_immutable();

-- ── 7) The audit trail is append-only, for everyone ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_agreement_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'the agreement audit trail is append-only; events cannot be % once written',
    lower(TG_OP) USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agreement_events_append_only() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_agreement_events_append_only ON public.paige_agreement_events;
CREATE TRIGGER trg_agreement_events_append_only
  BEFORE UPDATE OR DELETE ON public.paige_agreement_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_events_append_only();

-- TRUNCATE fires no row trigger, so a row-level guard alone leaves the whole trail deletable in one
-- statement. This is the statement-level half of the same rule.
DROP TRIGGER IF EXISTS trg_agreement_events_no_truncate ON public.paige_agreement_events;
CREATE TRIGGER trg_agreement_events_no_truncate
  BEFORE TRUNCATE ON public.paige_agreement_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_agreement_events_append_only();

-- updated_at upkeep, reusing the existing shared touch function.
DROP TRIGGER IF EXISTS trg_agreements_set_updated_at ON public.paige_agreements;
CREATE TRIGGER trg_agreements_set_updated_at
  BEFORE UPDATE ON public.paige_agreements
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

DROP TRIGGER IF EXISTS trg_agreement_signers_set_updated_at ON public.paige_agreement_signers;
CREATE TRIGGER trg_agreement_signers_set_updated_at
  BEFORE UPDATE ON public.paige_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

-- ── 8) RLS — tenant-scoped read, no direct client write ─────────────────────────────────────────
-- The six tiers (§51), stated explicitly because "who can see this" is the question this engine
-- must never get wrong:
--   God / platform operator  — reads every workspace via is_platform_owner().
--   Agency (as a tenant)     — its own workspace only. It does not aggregate sub-accounts here.
--   Standalone Solo          — its own workspace.
--   Sub-account              — its own workspace, never its parent's.
--   Client (portal seat)     — NOTHING. A portal client is a tenant's customer; a tenant's legal
--                              documents are not theirs to browse. There is no policy granting it.
--   Anonymous                — NOTHING. anon holds no grant on any of these three tables.
-- THE SIGNER IS NOT IN THAT LIST, DELIBERATELY. An external counterparty has no Supabase account,
-- so no policy can describe them and none tries. Their access is the token, checked server-side by
-- the public endpoint in slice 2, which then reads on their behalf and returns only their own
-- agreement. Signer access is therefore never an RLS decision, and cannot be widened by one.

ALTER TABLE public.paige_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_agreement_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paige_agreement_events ENABLE ROW LEVEL SECURITY;

-- Restrictive isolation: no row is ever visible outside its workspace. RESTRICTIVE is load-bearing,
-- not stylistic — it ANDs with every policy on the table, so a permissive policy added later cannot
-- widen access past it. This is also the ONLY thing denying a portal client (a clients.linked_user_id
-- user with no tenant_members row): they resolve no current_user_tenant_id(), so they match nothing.
-- If a future product decision wants a client to see their own signed agreements, that is a NEW named
-- permissive policy plus a deliberate, reviewed relaxation of this gate — never a quiet loosening of
-- either one while doing something else.
DROP POLICY IF EXISTS pa_tenant_isolation ON public.paige_agreements;
CREATE POLICY pa_tenant_isolation ON public.paige_agreements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS pas_tenant_isolation ON public.paige_agreement_signers;
CREATE POLICY pas_tenant_isolation ON public.paige_agreement_signers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS pae_tenant_isolation ON public.paige_agreement_events;
CREATE POLICY pae_tenant_isolation ON public.paige_agreement_events
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- Permissive read for a member of the owning workspace.
DROP POLICY IF EXISTS pa_tenant_read ON public.paige_agreements;
CREATE POLICY pa_tenant_read ON public.paige_agreements
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS pas_tenant_read ON public.paige_agreement_signers;
CREATE POLICY pas_tenant_read ON public.paige_agreement_signers
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS pae_tenant_read ON public.paige_agreement_events;
CREATE POLICY pae_tenant_read ON public.paige_agreement_events
  FOR SELECT TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- No direct authenticated write anywhere. The DEFINER writers below and the service-role edge
-- functions are the only paths in, so freezing, hashing and sealing cannot be skipped by writing
-- the row straight from a browser.
DROP POLICY IF EXISTS pa_no_direct_write ON public.paige_agreements;
CREATE POLICY pa_no_direct_write ON public.paige_agreements
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS pa_no_direct_update ON public.paige_agreements;
CREATE POLICY pa_no_direct_update ON public.paige_agreements
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS pa_no_direct_delete ON public.paige_agreements;
CREATE POLICY pa_no_direct_delete ON public.paige_agreements
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS pas_no_direct_write ON public.paige_agreement_signers;
CREATE POLICY pas_no_direct_write ON public.paige_agreement_signers
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS pas_no_direct_update ON public.paige_agreement_signers;
CREATE POLICY pas_no_direct_update ON public.paige_agreement_signers
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS pas_no_direct_delete ON public.paige_agreement_signers;
CREATE POLICY pas_no_direct_delete ON public.paige_agreement_signers
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS pae_no_direct_write ON public.paige_agreement_events;
CREATE POLICY pae_no_direct_write ON public.paige_agreement_events
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

REVOKE ALL ON TABLE public.paige_agreements FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.paige_agreement_signers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.paige_agreement_events FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.paige_agreements TO authenticated;
GRANT SELECT ON TABLE public.paige_agreement_signers TO authenticated;
GRANT SELECT ON TABLE public.paige_agreement_events TO authenticated;
GRANT ALL ON TABLE public.paige_agreements TO service_role;
GRANT ALL ON TABLE public.paige_agreement_signers TO service_role;
-- The audit trail is the one table the service role may NOT rewrite. The trigger refuses an UPDATE
-- or DELETE anyway; withholding the grant means a buggy writer fails at the door rather than at the
-- trigger, and makes the intent legible in the catalog.
GRANT SELECT, INSERT ON TABLE public.paige_agreement_events TO service_role;

-- THE TOKEN HASH NEVER REACHES A BROWSER. Even a workspace owner has no legitimate use for it, and
-- a column that is never selected is a column that cannot leak through a careless `select *`.
REVOKE SELECT (token_hash) ON public.paige_agreement_signers FROM authenticated;

-- ── 9) The private bucket for agreement documents ───────────────────────────────────────────────
-- Private, PDF-only. Object keys are `${tenant_id}/${agreement_id}/...`, so the first path segment
-- is the owning workspace. Writes are NOT granted to authenticated callers — only the service-role
-- edge functions write — so no tenant user can upload, overwrite or delete a document of record.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('paige-agreements', 'paige-agreements', false, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS paige_agreements_read ON storage.objects;
CREATE POLICY paige_agreements_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'paige-agreements'
    AND (
      public.is_platform_owner()
      OR (
        -- The uuid shape is checked BEFORE the cast. An object whose name does not start with a
        -- uuid segment must evaluate false; without the regex the cast raises 22P02 and takes the
        -- whole bucket's listing down with it for every caller.
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND ((storage.foldername(name))[1])::uuid = public.current_user_tenant_id()
      )
    )
  );

-- ── 10) The writers — one home for both the UI and Paige (§10/§18) ──────────────────────────────
-- Both callers land here rather than each writing rows their own way. The authority pattern is the
-- one save_client_agreement already established: the tenant is resolved SERVER-SIDE from the
-- session, the caller-supplied _expected_tenant_id can only REFUSE (it never selects a workspace),
-- and a non-admin is turned away before anything is read.

CREATE OR REPLACE FUNCTION public.save_paige_agreement(
  _expected_tenant_id uuid,
  _agreement_id uuid,            -- null creates
  _contact_id uuid,
  _title text,
  _body_markdown text,
  _offer_id uuid DEFAULT NULL,
  _commercial_terms_id uuid DEFAULT NULL,
  _body_source text DEFAULT 'inline',
  _source_version_id uuid DEFAULT NULL,
  _expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row public.paige_agreements;
  _title_t text := btrim(coalesce(_title, ''));
  _body_t  text := btrim(coalesce(_body_markdown, ''));
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  -- Refusal-only. A mismatch means the workspace changed under the caller between render and save.
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may draft an agreement with a client'
      USING ERRCODE = '42501';
  END IF;

  IF _title_t = '' THEN
    RAISE EXCEPTION 'give this agreement a title' USING ERRCODE = '23514';
  END IF;
  IF _body_t = '' THEN
    RAISE EXCEPTION 'an agreement needs a body before it can be saved' USING ERRCODE = '23514';
  END IF;
  IF _body_source NOT IN ('inline','tenant_agreement_version') THEN
    RAISE EXCEPTION 'that is not a body source this engine understands' USING ERRCODE = '23514';
  END IF;

  -- The IDOR gate. The trigger re-proves all of this on write; doing it here too turns a raw 42501
  -- into a sentence a person can act on.
  PERFORM 1 FROM public.clients c WHERE c.id = _contact_id AND c.tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that client is not in this workspace' USING ERRCODE = '42501';
  END IF;

  IF _agreement_id IS NULL THEN
    INSERT INTO public.paige_agreements
      (tenant_id, contact_id, offer_id, commercial_terms_id, title, body_source,
       source_version_id, body_markdown, status, version, created_by)
    VALUES
      (_tenant, _contact_id, _offer_id, _commercial_terms_id, _title_t, _body_source,
       CASE WHEN _body_source = 'tenant_agreement_version' THEN _source_version_id ELSE NULL END,
       _body_t, 'draft', 1, _actor)
    RETURNING * INTO _row;

    INSERT INTO public.paige_agreement_events
      (agreement_id, tenant_id, event_type, actor_kind, actor_user_id, detail)
    VALUES (_row.id, _tenant, 'created', 'owner', _actor,
            jsonb_build_object('title', _row.title, 'version', _row.version));
  ELSE
    -- Only a draft is editable. The seal trigger enforces that too; this gives the better message.
    SELECT * INTO _row FROM public.paige_agreements
      WHERE id = _agreement_id AND tenant_id = _tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'that agreement is not in this workspace' USING ERRCODE = '42501';
    END IF;
    IF _row.status <> 'draft' THEN
      RAISE EXCEPTION 'this agreement has already been sent; draft a new one rather than changing it'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.paige_agreements SET
      contact_id = _contact_id,
      offer_id = _offer_id,
      commercial_terms_id = _commercial_terms_id,
      title = _title_t,
      body_source = _body_source,
      source_version_id = CASE WHEN _body_source = 'tenant_agreement_version'
                               THEN _source_version_id ELSE NULL END,
      body_markdown = _body_t,
      -- A body edit is a new revision of what a signer would be shown.
      version = CASE WHEN _body_t IS DISTINCT FROM _row.body_markdown
                     THEN _row.version + 1 ELSE _row.version END,
      updated_at = now()
    WHERE id = _agreement_id
      AND tenant_id = _tenant
      AND (_expected_updated_at IS NULL OR updated_at = _expected_updated_at)
    RETURNING * INTO _row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'someone else changed this agreement while you were editing it'
        USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.paige_agreement_events
      (agreement_id, tenant_id, event_type, actor_kind, actor_user_id, detail)
    VALUES (_row.id, _tenant, 'edited', 'owner', _actor,
            jsonb_build_object('version', _row.version));
  END IF;

  -- A read-back, never an echo of what was passed in.
  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_paige_agreement(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_paige_agreement(uuid,uuid,uuid,text,text,uuid,uuid,text,uuid,timestamptz)
  TO authenticated;

-- Voiding: the owner withdraws a document that is already out. It is terminal, and it kills every
-- live signing link in the same statement — a link that still opened after the owner voided the
-- agreement would be the whole feature failing at the one moment it matters.
CREATE OR REPLACE FUNCTION public.void_paige_agreement(
  _expected_tenant_id uuid,
  _agreement_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row public.paige_agreements;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may void an agreement' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.paige_agreements
    WHERE id = _agreement_id AND tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that agreement is not in this workspace' USING ERRCODE = '42501';
  END IF;

  IF _row.status IN ('completed','declined','voided','expired') THEN
    RAISE EXCEPTION 'this agreement is already %; it cannot be voided', _row.status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.paige_agreements
     SET status = 'voided', voided_at = now(), updated_at = now()
   WHERE id = _agreement_id AND tenant_id = _tenant
  RETURNING * INTO _row;

  -- Revoke every outstanding link. Already-signed signers keep their record; what dies is access.
  UPDATE public.paige_agreement_signers
     SET token_revoked_at = now(), updated_at = now()
   WHERE agreement_id = _agreement_id
     AND token_hash IS NOT NULL
     AND token_revoked_at IS NULL;

  INSERT INTO public.paige_agreement_events
    (agreement_id, tenant_id, event_type, actor_kind, actor_user_id, detail)
  VALUES (_agreement_id, _tenant, 'voided', 'owner', _actor,
          jsonb_build_object('reason', nullif(btrim(coalesce(_reason,'')), '')));

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION public.void_paige_agreement(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_paige_agreement(uuid,uuid,text) TO authenticated;
