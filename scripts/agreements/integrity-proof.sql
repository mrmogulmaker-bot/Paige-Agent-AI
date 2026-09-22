\pset tuples_only on
\pset format unaligned
SELECT set_config('test.tenant','aaaaaaaa-0000-4000-8000-000000000001',false);
SELECT set_config('test.uid','11111111-0000-4000-8000-000000000001',false);
SELECT set_config('test.admin','true',false);

-- Each negative runs inside a savepoint and reports the SQLSTATE it actually raised.
-- "NO ERROR - GUARANTEE IS FALSE" is the failure string; any expected SQLSTATE is a pass.
CREATE OR REPLACE FUNCTION pg_temp.probe(label text, stmt text, expect text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    EXECUTE stmt;
    RETURN format('%-58s  NO ERROR - GUARANTEE IS FALSE', label);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE;
    RETURN format('%-58s  %s  %s', label, _state,
      CASE WHEN _state = expect THEN 'PASS' ELSE 'UNEXPECTED (wanted '||expect||')' END);
  END;
END $$;

INSERT INTO public.paige_agreements (id,tenant_id,contact_id,title,body_markdown)
VALUES ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001','Services','The body');

SELECT pg_temp.probe('P1  agreement names another workspace''s client',
  $$INSERT INTO public.paige_agreements (tenant_id,contact_id,title,body_markdown) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','c2222222-0000-4000-8000-000000000002','Leak','b')$$,'42501');
SELECT pg_temp.probe('P2  draft jumps straight to completed',
  $$UPDATE public.paige_agreements SET status='completed' WHERE id='dddddddd-0000-4000-8000-000000000001'$$,'23514');

UPDATE public.paige_agreements SET content_sha256=repeat('a',64), content_storage_key='k/1.pdf', status='sent', sent_at=now() WHERE id='dddddddd-0000-4000-8000-000000000001';

SELECT pg_temp.probe('P3  frozen document is rewritten',
  $$UPDATE public.paige_agreements SET content_sha256=repeat('b',64) WHERE id='dddddddd-0000-4000-8000-000000000001'$$,'23514');
SELECT pg_temp.probe('P4  body edited after the signer was sent it',
  $$UPDATE public.paige_agreements SET body_markdown='rewritten' WHERE id='dddddddd-0000-4000-8000-000000000001'$$,'23514');

UPDATE public.paige_agreements SET sealed_sha256=repeat('c',64), sealed_storage_key='k/s.pdf', status='completed', completed_at=now() WHERE id='dddddddd-0000-4000-8000-000000000001';

SELECT pg_temp.probe('P5  sealed record is rewritten',
  $$UPDATE public.paige_agreements SET sealed_sha256=repeat('d',64) WHERE id='dddddddd-0000-4000-8000-000000000001'$$,'23514');
SELECT pg_temp.probe('P6  terminal state reopened (completed -> sent)',
  $$UPDATE public.paige_agreements SET status='sent' WHERE id='dddddddd-0000-4000-8000-000000000001'$$,'23514');

INSERT INTO public.paige_agreement_events (id,agreement_id,tenant_id,event_type,actor_kind)
VALUES ('eeeeeeee-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','sent','owner');

SELECT pg_temp.probe('P7  audit event UPDATE',
  $$UPDATE public.paige_agreement_events SET event_type='voided' WHERE id='eeeeeeee-0000-4000-8000-000000000001'$$,'42501');
SELECT pg_temp.probe('P8  audit event DELETE',
  $$DELETE FROM public.paige_agreement_events WHERE id='eeeeeeee-0000-4000-8000-000000000001'$$,'42501');
SELECT pg_temp.probe('P9  audit trail TRUNCATE',
  $$TRUNCATE public.paige_agreement_events$$,'42501');
SELECT pg_temp.probe('P10 event filed against the wrong workspace',
  $$INSERT INTO public.paige_agreement_events (agreement_id,tenant_id,event_type,actor_kind) VALUES ('dddddddd-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','viewed','signer')$$,'42501');

INSERT INTO public.paige_agreement_signers (id,agreement_id,tenant_id,full_name,email,signing_order) VALUES
 ('f1111111-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','First Signer','one@example.com',1),
 ('f2222222-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Second Signer','two@example.com',2);

SELECT pg_temp.probe('P11 second signer signs out of turn',
  $$UPDATE public.paige_agreement_signers SET status='signed',signed_at=now(),esign_consent_at=now(),esign_consent_slug='c',esign_consent_version=1,esign_consent_sha256=repeat('e',64),typed_name='Second' WHERE id='f2222222-0000-4000-8000-000000000002'$$,'23514');
SELECT pg_temp.probe('P12 signed with no recorded consent',
  $$UPDATE public.paige_agreement_signers SET status='signed',signed_at=now(),typed_name='First' WHERE id='f1111111-0000-4000-8000-000000000001'$$,'23514');
SELECT pg_temp.probe('P13 signature predates the consent',
  $$UPDATE public.paige_agreement_signers SET status='signed',signed_at='2026-01-01Z',esign_consent_at='2026-01-02Z',esign_consent_slug='c',esign_consent_version=1,esign_consent_sha256=repeat('e',64),typed_name='First' WHERE id='f1111111-0000-4000-8000-000000000001'$$,'23514');
SELECT pg_temp.probe('P14 signer moved to another workspace',
  $$UPDATE public.paige_agreement_signers SET tenant_id='bbbbbbbb-0000-4000-8000-000000000002' WHERE id='f1111111-0000-4000-8000-000000000001'$$,'42501');
SELECT pg_temp.probe('P15 two signers share an email on one agreement',
  $$INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order) VALUES ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Dupe','one@example.com',3)$$,'23505');
SELECT pg_temp.probe('P16 two signers share a token hash',
  $$INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order,token_hash,token_expires_at) VALUES ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','X','x@example.com',4,repeat('9',64),now()+interval '30 days'), ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Y','y@example.com',5,repeat('9',64),now()+interval '30 days')$$,'23505');

SELECT pg_temp.probe('P17 token minted with no expiry (immortal link)',
  $$UPDATE public.paige_agreement_signers SET token_hash=repeat('7',64), token_expires_at=NULL WHERE id='f1111111-0000-4000-8000-000000000001'$$,'23514');
INSERT INTO public.paige_agreement_signers (id,agreement_id,tenant_id,full_name,email,signing_order,status,declined_at)
VALUES ('f3333333-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Third','three@example.com',9,'declined',now());
SELECT pg_temp.probe('P19 same email in two cases on one agreement',
  $$INSERT INTO public.paige_agreement_signers (agreement_id,tenant_id,full_name,email,signing_order) VALUES ('dddddddd-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Shouty','ONE@EXAMPLE.COM',7)$$,'23505');
SELECT pg_temp.probe('P18 a declined signer is flipped to signed',
  $$UPDATE public.paige_agreement_signers SET status='signed', signed_at=now(), esign_consent_at=now()-interval '1 min', esign_consent_slug='c', esign_consent_version=1, esign_consent_sha256=repeat('e',64), typed_name='Third' WHERE id='f3333333-0000-4000-8000-000000000003'$$,'23514');

\echo ''
\echo '--- POSITIVE CONTROLS (these MUST succeed, or the negatives above prove nothing) ---'
UPDATE public.paige_agreement_signers SET status='signed',signed_at=now(),esign_consent_at=now()-interval '1 min',esign_consent_slug='c',esign_consent_version=1,esign_consent_sha256=repeat('e',64),typed_name='First Signer' WHERE id='f1111111-0000-4000-8000-000000000001';
SELECT 'C1  first signer signs in order                              '||status FROM public.paige_agreement_signers WHERE id='f1111111-0000-4000-8000-000000000001';
UPDATE public.paige_agreement_signers SET status='signed',signed_at=now(),esign_consent_at=now()-interval '1 min',esign_consent_slug='c',esign_consent_version=1,esign_consent_sha256=repeat('e',64),typed_name='Second Signer' WHERE id='f2222222-0000-4000-8000-000000000002';
SELECT 'C2  second signer signs after the first                      '||status FROM public.paige_agreement_signers WHERE id='f2222222-0000-4000-8000-000000000002';
SELECT 'C3  audit trail rows still readable                          '||count(*)::text FROM public.paige_agreement_events;
