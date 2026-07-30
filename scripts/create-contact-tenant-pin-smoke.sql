-- §9 regression smoke for create_contact tenant pinning.
-- Run after applying migrations. This is read-only: it validates the deployed
-- definition and grants without creating a contact or firing producer triggers.

DO $smoke$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef(
    'public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text)'::regprocedure
  ) INTO _def;

  IF _def NOT LIKE '%WHEN auth.uid() IS NOT NULL THEN public.current_user_tenant_id()%' THEN
    RAISE EXCEPTION 'create_contact does not pin authenticated callers to current_user_tenant_id()';
  END IF;

  IF _def LIKE '%_tenant%COALESCE(p_tenant_id, public.current_user_tenant_id())%' THEN
    RAISE EXCEPTION 'create_contact still prefers caller-supplied p_tenant_id';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon unexpectedly retains EXECUTE on create_contact';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated lost EXECUTE on create_contact';
  END IF;
END
$smoke$;
