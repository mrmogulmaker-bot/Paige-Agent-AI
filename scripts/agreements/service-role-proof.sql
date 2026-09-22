\pset tuples_only on
\pset format unaligned
CREATE OR REPLACE FUNCTION pg_temp.probe(label text, stmt text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _msg text;
BEGIN
  BEGIN
    EXECUTE stmt;
    RETURN format('%-56s  SUCCEEDED - INTEGRITY CLAIM IS FALSE', label);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    RETURN format('%-56s  REFUSED %s : %s', label, _state, _msg);
  END;
END $$;

SELECT 'table owner                     = '||tableowner FROM pg_tables WHERE tablename='paige_agreements';
SELECT 'service_role is superuser       = '||rolsuper::text FROM pg_roles WHERE rolname='service_role';
SELECT 'service_role bypasses RLS       = '||rolbypassrls::text FROM pg_roles WHERE rolname='service_role';
SELECT 'service_role member of owner    = '||pg_has_role('service_role','proofrunner','MEMBER')::text;

SET ROLE service_role;
SELECT 'acting as                       = '||current_user;

SELECT pg_temp.probe('S1  ALTER TABLE ... DISABLE TRIGGER ALL',
  $$ALTER TABLE public.paige_agreements DISABLE TRIGGER ALL$$);
SELECT pg_temp.probe('S2  ALTER TABLE ... DISABLE TRIGGER (one, by name)',
  $$ALTER TABLE public.paige_agreements DISABLE TRIGGER trg_agreement_seal_immutable$$);
SELECT pg_temp.probe('S3  SET session_replication_role = replica',
  $$SET session_replication_role = 'replica'$$);
SELECT pg_temp.probe('S4  DROP TRIGGER',
  $$DROP TRIGGER trg_agreement_events_append_only ON public.paige_agreement_events$$);
SELECT pg_temp.probe('S5  redefine the guard function',
  $$CREATE OR REPLACE FUNCTION public.enforce_agreement_events_append_only() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'$$);
SELECT pg_temp.probe('S6  UPDATE an audit event as service_role',
  $$UPDATE public.paige_agreement_events SET event_type='voided'$$);
SELECT pg_temp.probe('S7  DELETE an audit event as service_role',
  $$DELETE FROM public.paige_agreement_events$$);
SELECT pg_temp.probe('S8  rewrite a sealed agreement as service_role',
  $$UPDATE public.paige_agreements SET sealed_sha256=repeat('f',64) WHERE sealed_sha256 IS NOT NULL$$);
RESET ROLE;
