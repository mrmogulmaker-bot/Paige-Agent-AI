\pset tuples_only on
\pset format unaligned
SELECT set_config('test.tenant','aaaaaaaa-0000-4000-8000-000000000001',false);
SELECT set_config('test.uid','11111111-0000-4000-8000-000000000001',false);
SELECT set_config('test.admin','true',false);
SELECT set_config('test.member','true',false);

CREATE OR REPLACE FUNCTION pg_temp.probe(label text, stmt text, expect text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    EXECUTE stmt;
    RETURN format('%-56s  NO ERROR - GUARANTEE IS FALSE', label);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
    RETURN format('%-56s  %s  %s', label, _state,
      CASE WHEN _state = expect THEN 'PASS' ELSE 'UNEXPECTED (wanted '||expect||')' END);
  END;
END $$;

\echo '--- K1 create_agreement_signing with NO price and NO offer (owner ruling 3) ---'
SELECT 'K1 '||(public.create_agreement_signing(
  'aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',NULL,
  'Mutual NDA','paige_draft','This agreement is between the parties named below.') ->> 'signature_state');

-- Keep the id for the rest of the run.
CREATE TEMP TABLE k AS SELECT (public.create_agreement_signing(
  'aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',NULL,
  'Services Agreement','paige_draft','The body of the agreement.') ->> 'signing_id')::uuid AS id;

INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order)
SELECT id,'aaaaaaaa-0000-4000-8000-000000000001','Jordan Avery','jordan@example.com',1 FROM k;

\echo '--- K2 issue_agreement_signing_link returns a raw 64-hex token ONCE ---'
CREATE TEMP TABLE tok AS
  SELECT public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001',(SELECT id FROM k),30) AS j;
SELECT 'K2 token_is_64_hex = '||((j->>'token') ~ '^[0-9a-f]{64}$')::text FROM tok;

\echo '--- K3 only the HASH is stored; the raw token is nowhere in the row ---'
SELECT 'K3 raw_token_stored = '||EXISTS(
  SELECT 1 FROM public.paige_agreement_signers s, tok
   WHERE s.token_hash = (tok.j->>'token'))::text;

\echo '--- K4 peek returns the document for a live token ---'
SELECT 'K4 '||coalesce(document_title,'(none)')||' valid='||is_valid::text||' state='||coalesce(signature_state,'-')
FROM public.peek_agreement_signing((SELECT j->>'token' FROM tok));

\echo '--- K4b a PRICED agreement returns its figure (the join is exercised, not just the NULL branch) ---'
INSERT INTO public.tenant_client_agreements (id,tenant_id,contact_id,agreed_amount_minor,agreed_currency,term_kind)
VALUES ('7a7a7a7a-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',250000,'usd','recurring');
CREATE TEMP TABLE k3 AS SELECT (public.create_agreement_signing(
  'aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001','7a7a7a7a-0000-4000-8000-000000000001',
  'Retainer','paige_draft','Body of the retainer.') ->> 'signing_id')::uuid AS id;
INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order)
SELECT id,'aaaaaaaa-0000-4000-8000-000000000001','Priced Signer','priced@example.com',1 FROM k3;
CREATE TEMP TABLE tok3 AS
  SELECT public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001',(SELECT id FROM k3),30) AS j;
SELECT 'K4b amount='||coalesce(amount_minor::text,'null')||' ccy='||coalesce(amount_currency,'null')||' term='||coalesce(term_summary,'null')||' valid='||is_valid::text
FROM public.peek_agreement_signing((SELECT j->>'token' FROM tok3));

\echo '--- K5 THE ALLOW-LIST: peek exposes no tenant id and no staff address ---'
SELECT 'K5 leaks = '||(
  SELECT count(*)::text FROM information_schema.parameters p
   WHERE p.specific_schema='public' AND p.parameter_mode='OUT'
     AND p.specific_name LIKE 'peek_agreement_signing%'
     AND (p.parameter_name ILIKE '%tenant%' OR p.parameter_name ILIKE '%email%' OR p.parameter_name ILIKE '%token%'));

\echo '--- K6 ONE INDISTINGUISHABLE REFUSAL across every cause ---'
-- unknown token
SELECT 'K6a unknown  = '||is_valid::text||' cols_null='||(document_title IS NULL AND business_name IS NULL AND signature_state IS NULL)::text
FROM public.peek_agreement_signing(repeat('b',64));
-- malformed token
SELECT 'K6b malformed= '||is_valid::text||' cols_null='||(document_title IS NULL AND business_name IS NULL AND signature_state IS NULL)::text
FROM public.peek_agreement_signing('not-a-token');
-- expired token
UPDATE public.paige_agreement_signers SET token_expires_at = now() - interval '1 day'
 WHERE agreement_id = (SELECT id FROM k);
SELECT 'K6c expired  = '||is_valid::text||' cols_null='||(document_title IS NULL AND business_name IS NULL AND signature_state IS NULL)::text
FROM public.peek_agreement_signing((SELECT j->>'token' FROM tok));
UPDATE public.paige_agreement_signers SET token_expires_at = now() + interval '30 days'
 WHERE agreement_id = (SELECT id FROM k);

\echo '--- K7 decline works once, and is not a second decline on replay ---'
-- K7c runs FIRST, on a separate agreement, because K7a consumes the one below. Somebody who has
-- already signed and then clicks Decline must be told no: the old HTML endpoint answered that case
-- with {ok:true, note:'already recorded'}, so a party who was in fact bound was told they had
-- withdrawn — a false statement about legal status, on a legal surface. The conditional UPDATE is
-- what makes it false here; this asserts that rather than trusting it.
DO $k7c$
DECLARE _a jsonb; _id uuid; _t jsonb; _ok text;
BEGIN
  _a := public.create_agreement_signing('aaaaaaaa-0000-4000-8000-000000000001',
        'c1111111-0000-4000-8000-000000000001', NULL, 'Signed then declined', 'paige_draft', 'Body.', NULL);
  _id := (_a ->> 'signing_id')::uuid;
  _t := public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001', _id, 30);
  UPDATE public.paige_agreement_signers
     SET status='signed', signed_at=now(), esign_consent_at=now()-interval '1 min',
         esign_consent_slug='c', esign_consent_version=1, esign_consent_sha256=repeat('e',64),
         typed_name='Already Signed'
   WHERE agreement_id = _id;
  _ok := public.decline_agreement_signing(_t ->> 'token', 'changed my mind') ->> 'ok';
  RAISE NOTICE 'K7c decline after signing = %', _ok;
END $k7c$;
SELECT 'K7a first  = '||(public.decline_agreement_signing((SELECT j->>'token' FROM tok),'Not this quarter') ->> 'ok');
SELECT 'K7b replay = '||(public.decline_agreement_signing((SELECT j->>'token' FROM tok),'again') ->> 'ok');

\echo '--- K8 a declined agreement refuses exactly like an unknown one ---'
SELECT 'K8 declined  = '||is_valid::text||' cols_null='||(document_title IS NULL AND business_name IS NULL AND signature_state IS NULL)::text
FROM public.peek_agreement_signing((SELECT j->>'token' FROM tok));

\echo '--- K9 decline killed every live link on that agreement ---'
SELECT 'K9 live_links_left = '||count(*)::text FROM public.paige_agreement_signers
 WHERE agreement_id=(SELECT id FROM k) AND token_hash IS NOT NULL AND token_revoked_at IS NULL;

\echo '--- K10 void NULLs the token hash so the link cannot even be tested for ---'
CREATE TEMP TABLE k2 AS SELECT (public.create_agreement_signing(
  'aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',NULL,
  'To be withdrawn','paige_draft','Body.') ->> 'signing_id')::uuid AS id;
INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order)
SELECT id,'aaaaaaaa-0000-4000-8000-000000000001','Sam Okafor','sam@example.com',1 FROM k2;
CREATE TEMP TABLE tok2 AS
  SELECT public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001',(SELECT id FROM k2),30) AS j;
SELECT 'K10a voided = '||(public.void_agreement_signing('aaaaaaaa-0000-4000-8000-000000000001',(SELECT id FROM k2)) ->> 'ok');
SELECT 'K10b hash_gone = '||(count(*) = 0)::text FROM public.paige_agreement_signers
 WHERE agreement_id=(SELECT id FROM k2) AND token_hash IS NOT NULL;
SELECT 'K10c voided_refuses = '||is_valid::text FROM public.peek_agreement_signing((SELECT j->>'token' FROM tok2));

\echo '--- K11 an uploaded document is representable; a bodyless one is not ---'
SELECT 'K11a upload = '||(public.create_agreement_signing(
  'aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',NULL,
  'Attorney NDA','tenant_upload',NULL,'aaaaaaaa/doc.pdf') ->> 'signature_state');
SELECT pg_temp.probe('K11b a document with no body at all',
  $$SELECT public.create_agreement_signing('aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001',NULL,'Empty','paige_draft',NULL)$$,'23514');

\echo '--- K12 FINDING 3: every state this design claims is REACHABLE, proven by reaching it ---'
DO $$
DECLARE _id uuid; _tok text; _sid uuid; _states text[] := ARRAY[]::text[];
BEGIN
  -- draft
  _id := (public.create_agreement_signing('aaaaaaaa-0000-4000-8000-000000000001',
          'c1111111-0000-4000-8000-000000000001',NULL,'Reach','paige_draft','Body.') ->> 'signing_id')::uuid;
  _states := _states || (SELECT status FROM public.paige_agreements WHERE id=_id);
  INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order)
  VALUES (_id,'aaaaaaaa-0000-4000-8000-000000000001','R','r@example.com',1) RETURNING id INTO _sid;
  -- sent
  _tok := public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001',_id,30) ->> 'token';
  _states := _states || (SELECT status FROM public.paige_agreements WHERE id=_id);
  -- viewed
  UPDATE public.paige_agreements SET status='viewed' WHERE id=_id;
  _states := _states || (SELECT status FROM public.paige_agreements WHERE id=_id);
  -- completed (the terminal the contract's own broken CHECK made unreachable)
  UPDATE public.paige_agreement_signers SET status='signed', signed_at=now(),
    esign_consent_at=now()-interval '1 min', esign_consent_slug='c', esign_consent_version=1,
    esign_consent_sha256=repeat('e',64), typed_name='R' WHERE id=_sid;
  UPDATE public.paige_agreements SET status='completed', completed_at=now(),
    sealed_sha256=repeat('c',64), sealed_storage_key='k/s.pdf' WHERE id=_id;
  _states := _states || (SELECT status FROM public.paige_agreements WHERE id=_id);
  RAISE NOTICE 'K12 reached: %', array_to_string(_states, ' -> ');
END $$;

DO $$
DECLARE _id uuid; _sid uuid;
BEGIN
  _id := (public.create_agreement_signing('aaaaaaaa-0000-4000-8000-000000000001',
          'c1111111-0000-4000-8000-000000000001',NULL,'Expire me','paige_draft','Body.') ->> 'signing_id')::uuid;
  INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order)
  VALUES (_id,'aaaaaaaa-0000-4000-8000-000000000001','E','e@example.com',1) RETURNING id INTO _sid;
  PERFORM public.issue_agreement_signing_link('aaaaaaaa-0000-4000-8000-000000000001',_id,1);
  UPDATE public.paige_agreements SET expires_at = now() - interval '1 day' WHERE id=_id;
  PERFORM public.sweep_expired_paige_agreements();
  RAISE NOTICE 'K12 expired reachable: %', (SELECT status FROM public.paige_agreements WHERE id=_id);
END $$;
