\pset tuples_only on
\pset format unaligned
SELECT set_config('test.tenant','aaaaaaaa-0000-4000-8000-000000000001',false);
SELECT set_config('test.uid','11111111-0000-4000-8000-000000000001',false);
SELECT set_config('test.admin','true',false);
SELECT set_config('test.member','true',false);

-- A live agreement whose deadline has already passed, plus a signer holding a live token.
INSERT INTO public.paige_agreements (id,tenant_id,contact_id,title,body_markdown,status,content_sha256,content_storage_key,sent_at,expires_at)
VALUES ('99999999-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','c1111111-0000-4000-8000-000000000001','Lapsed','body','sent',repeat('a',64),'k/l.pdf',now()-interval '40 days',now()-interval '1 day');
INSERT INTO public.paige_agreement_signers (id,agreement_id,tenant_id,full_name,email,signing_order,token_hash,token_expires_at)
VALUES ('88888888-0000-4000-8000-000000000001','99999999-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Lapsed Signer','lapsed@example.com',1,repeat('5',64),now()+interval '30 days');

\echo '--- E1 the sweeper reports how many it expired (expect >= 1) ---'
SELECT 'E1 swept = '||public.sweep_expired_paige_agreements()::text;

\echo '--- E2 the agreement now reads expired ---'
SELECT 'E2 status = '||status FROM public.paige_agreements WHERE id='99999999-0000-4000-8000-000000000001';

\echo '--- E3 THE DEAD LINK WAS REVOKED (a token must not outlive its agreement) ---'
SELECT 'E3 revoked = '||(token_revoked_at IS NOT NULL)::text FROM public.paige_agreement_signers WHERE id='88888888-0000-4000-8000-000000000001';

\echo '--- E4 an expired event is on the trail, attributed to the system ---'
SELECT 'E4 events = '||count(*)::text||' actor='||coalesce(max(actor_kind),'none')
FROM public.paige_agreement_events WHERE agreement_id='99999999-0000-4000-8000-000000000001' AND event_type='expired';

\echo '--- E5 running it again is a no-op (expired is terminal) ---'
SELECT 'E5 swept_again = '||public.sweep_expired_paige_agreements()::text;

\echo '--- E6 the overview returns the row with its outstanding signer named ---'
SELECT 'E6 '||title||' status='||status||' signers='||signers_total::text||' signed='||signers_signed::text||' outstanding='||array_to_string(outstanding_names,',')
FROM public.paige_agreement_overview('aaaaaaaa-0000-4000-8000-000000000001') WHERE id='99999999-0000-4000-8000-000000000001';

\echo '--- E7 THE OVERVIEW LEAKS NO TOKEN HASH OR STORAGE KEY (column list is the control) ---'
SELECT 'E7 columns = '||string_agg(column_name, ',' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_name='paige_agreement_overview' OR (table_schema='public' AND table_name='') LIMIT 1;
SELECT 'E7 leak_check = '||(NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='paige_agreement_overview'
    AND (pg_get_function_result(p.oid) ILIKE '%token%' OR pg_get_function_result(p.oid) ILIKE '%storage_key%')
))::text;

\echo '--- E8 a caller whose workspace differs is REFUSED, not given an empty list ---'
DO $$
BEGIN
  PERFORM public.paige_agreement_overview('bbbbbbbb-0000-4000-8000-000000000002');
  RAISE NOTICE 'E8 NO ERROR - GUARANTEE IS FALSE';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'E8 refused %', SQLSTATE;
END $$;

\echo '--- E9 a non-member is REFUSED ---'
SELECT set_config('test.member','false',false);
DO $$
BEGIN
  PERFORM public.paige_agreement_overview('aaaaaaaa-0000-4000-8000-000000000001');
  RAISE NOTICE 'E9 NO ERROR - GUARANTEE IS FALSE';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'E9 refused %', SQLSTATE;
END $$;
