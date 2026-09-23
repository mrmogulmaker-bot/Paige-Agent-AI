-- INT-163 — widen `paige_agreement_overview` so the Agreements screens can read from it.
--
-- WHY THIS EXISTS. The function's own header calls it "the read behind Paige's agreement_status tool
-- and the tenant's own list", but it returned a summary narrow enough that the tenant's list could
-- not be built from it: no commercial-terms link, no document source, no declined/voided/created
-- timestamps, and nothing about the one counterparty the surface speaks for. So the Sales desk grew
-- a PARALLEL read straight off `paige_agreements` with an embedded signer join. Two reads of one
-- record is the second-system shape we are meant to be removing, and the parallel one is the read
-- that has no place to put a refusal. Widening this one lets that read retire.
--
-- WHAT IS DELIBERATELY NOT HERE: storage keys. The original refused to emit `sealed_storage_key` or
-- `document_path` and that refusal was right — a key shaped `<tenant_id>/<agreement_id>/…` carries
-- both ids into every browser that opens the screen, and a list endpoint is the worst place to hand
-- them out because it does it for every row at once. Sealedness is a QUESTION THE SCREEN ASKS
-- ("is there a signed copy to open?"), not a location, so it is answered as a boolean and the bytes
-- stay behind `agreement-document`, which re-authorises per request. Same for the uploaded file.
--
-- The return type changes, so this must DROP and recreate rather than CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.paige_agreement_overview(uuid, uuid, text);

CREATE FUNCTION public.paige_agreement_overview(
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
  -- The link to the engagement on `tenant_client_agreements`. Carried as an ID and nothing more:
  -- the COMMERCIAL state lives over there and is not restated here, so this row can never disagree
  -- with it (owner ruling, 2026-09-22 — signature state is separate from commercial state).
  commercial_terms_id uuid,
  -- 'paige_draft' | 'tenant_template' | 'tenant_upload'. The screen needs it to know whether there
  -- is a file behind this agreement at all, and it is the field that decides which send path runs.
  body_source text,
  signers_total integer,
  signers_signed integer,
  outstanding_names text[],
  -- THE THREE SIGNER FACTS, EACH AGGREGATED ON ITS OWN TERMS. They look like one signer's row and
  -- they are not, which is the mistake this comment exists to stop the next reader repeating:
  --
  --   · counterparty_name — the signer with the LOWEST signing_order. The party this
  --     single-counterparty surface speaks for. Not "whoever signed": keying it off a signature
  --     renders blank on every sent-but-unsigned agreement, which is precisely the state the band
  --     exists to show.
  --   · first_viewed_at — the EARLIEST view across ALL signers. The column answers "has anybody
  --     opened this", not "did signer one open it".
  --   · decline_reason — from whichever signer ACTUALLY DECLINED, which on a multi-party document
  --     need not be the first one. Attributing one signer's words to another is a falsehood the
  --     surface would state with confidence.
  --
  -- Aggregating here is also a disclosure fix, one layer in from the storage key. The band used to
  -- pull the whole embedded signer array into the browser for every row — every name, every decline
  -- reason, every view time — and reduce it client-side. Once the server reduces, those per-signer
  -- rows stop crossing at all.
  counterparty_name text,
  decline_reason text,
  first_viewed_at timestamptz,
  created_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  expires_at timestamptz,
  document_sha256 text,
  sealed_sha256 text,
  -- Presence, never location. See the header.
  has_sealed_copy boolean,
  has_document_file boolean,
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
    a.commercial_terms_id,
    a.body_source,
    (SELECT count(*)::integer FROM public.paige_agreement_signers s WHERE s.agreement_id = a.id),
    (SELECT count(*)::integer FROM public.paige_agreement_signers s WHERE s.agreement_id = a.id AND s.status = 'signed'),
    (SELECT coalesce(array_agg(s.full_name ORDER BY s.signing_order), ARRAY[]::text[])
       FROM public.paige_agreement_signers s
      WHERE s.agreement_id = a.id AND s.status <> 'signed'),
    counterparty.full_name,
    (SELECT s.decline_reason
       FROM public.paige_agreement_signers s
      WHERE s.agreement_id = a.id
        AND s.status = 'declined'
        AND s.decline_reason IS NOT NULL
      ORDER BY s.declined_at NULLS LAST, s.signing_order, s.id
      LIMIT 1),
    (SELECT min(s.first_viewed_at)
       FROM public.paige_agreement_signers s
      WHERE s.agreement_id = a.id),
    a.created_at,
    a.sent_at,
    a.viewed_at,
    a.completed_at,
    a.declined_at,
    a.voided_at,
    a.expires_at,
    a.content_sha256,
    a.sealed_sha256,
    (a.sealed_storage_key IS NOT NULL) AS has_sealed_copy,
    (a.document_path IS NOT NULL) AS has_document_file,
    a.updated_at
  FROM public.paige_agreements a
  LEFT JOIN public.clients c ON c.id = a.contact_id AND c.tenant_id = a.tenant_id
  -- Lowest signing_order wins; `s.id` only breaks a tie so the answer is stable rather than
  -- whichever row the planner happened to return.
  LEFT JOIN LATERAL (
    SELECT s.full_name
      FROM public.paige_agreement_signers s
     WHERE s.agreement_id = a.id
     ORDER BY s.signing_order, s.id
     LIMIT 1
  ) AS counterparty ON TRUE
  WHERE a.tenant_id = _tenant
    AND (_contact_id IS NULL OR a.contact_id = _contact_id)
    AND (_status IS NULL OR a.status = _status)
  ORDER BY a.updated_at DESC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.paige_agreement_overview(uuid,uuid,text) IS
  'INT-163: the ONE read behind the tenant''s agreement list and Paige''s agreement status. Tenant '
  'comes from the session, never the argument — the argument only proves the caller and the server '
  'agree about which workspace is active. Emits no storage key: sealedness and file-presence are '
  'booleans, and the bytes stay behind agreement-document, which re-authorises per request.';

REVOKE ALL ON FUNCTION public.paige_agreement_overview(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_agreement_overview(uuid,uuid,text) TO authenticated;
