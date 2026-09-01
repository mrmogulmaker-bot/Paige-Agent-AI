-- Transactional smoke for the Solo People / PAIGE shared contact upsert contract.
-- Requires a seeded admin|super_admin|coach and at least two tenants. It leaves no rows behind.
BEGIN;

DO $smoke$
DECLARE
  actor_id uuid;
  tenant_a uuid;
  tenant_b uuid;
  contact_id uuid;
  cleared_email text;
BEGIN
  SELECT ur.user_id INTO actor_id
    FROM public.user_roles AS ur
   WHERE ur.role::text IN ('admin','super_admin','coach')
   LIMIT 1;
  SELECT t.id INTO tenant_a FROM public.tenants AS t ORDER BY t.created_at LIMIT 1;
  SELECT t.id INTO tenant_b FROM public.tenants AS t WHERE t.id <> tenant_a ORDER BY t.created_at LIMIT 1;
  IF actor_id IS NULL OR tenant_a IS NULL OR tenant_b IS NULL THEN
    RAISE EXCEPTION 'CONTACT_UPSERT_SMOKE_NEEDS_SEEDED_ACTOR_AND_TWO_TENANTS';
  END IF;

  contact_id := public.upsert_contact(
    jsonb_build_object('first_name','Smoke','last_name','Contact','email','smoke-upsert@example.invalid','source','manual'),
    NULL, tenant_a, actor_id, 'api'
  );
  PERFORM public.upsert_contact(
    jsonb_build_object('email',NULL,'city','Atlanta','tags',jsonb_build_array('hotfix'),'do_not_contact',true),
    contact_id, tenant_a, actor_id, 'api'
  );
  SELECT c.email INTO cleared_email FROM public.clients AS c WHERE c.id = contact_id AND c.tenant_id = tenant_a;
  IF cleared_email IS NOT NULL THEN RAISE EXCEPTION 'CONTACT_UPSERT_CLEAR_FAILED'; END IF;

  BEGIN
    PERFORM public.upsert_contact(jsonb_build_object('tenant_id',tenant_b), contact_id, tenant_a, actor_id, 'api');
    RAISE EXCEPTION 'CONTACT_UPSERT_UNKNOWN_FIELD_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM public.upsert_contact(jsonb_build_object('city','Elsewhere'), contact_id, tenant_b, actor_id, 'api');
    RAISE EXCEPTION 'CONTACT_UPSERT_CROSS_TENANT_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  RAISE NOTICE 'CONTACT_UPSERT_SMOKE_OK contact_id=%', contact_id;
END;
$smoke$;

ROLLBACK;
