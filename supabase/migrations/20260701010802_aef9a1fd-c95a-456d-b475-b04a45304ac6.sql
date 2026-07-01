
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS account_number_prefix text;
UPDATE public.tenants
SET account_number_prefix = COALESCE(NULLIF(UPPER(REGEXP_REPLACE(SUBSTRING(slug,1,5),'[^a-zA-Z0-9]','','g')),''),'ACCT')
WHERE account_number_prefix IS NULL;
ALTER TABLE public.tenants ALTER COLUMN account_number_prefix SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_account_number_seq (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_account_number_seq TO authenticated;
GRANT ALL ON public.tenant_account_number_seq TO service_role;
ALTER TABLE public.tenant_account_number_seq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seq readable to tenant staff" ON public.tenant_account_number_seq;
CREATE POLICY "seq readable to tenant staff"
ON public.tenant_account_number_seq FOR SELECT TO authenticated
USING (tenant_id = public.current_user_tenant_id() OR public.is_platform_owner());

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS account_number text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_account_number_uniq
  ON public.clients(tenant_id, account_number) WHERE account_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.allocate_account_number(_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prefix text; _next bigint;
BEGIN
  SELECT account_number_prefix INTO _prefix FROM public.tenants WHERE id = _tenant_id;
  IF _prefix IS NULL THEN _prefix := 'ACCT'; END IF;
  INSERT INTO public.tenant_account_number_seq(tenant_id, last_value) VALUES (_tenant_id, 1)
  ON CONFLICT (tenant_id) DO UPDATE
    SET last_value = tenant_account_number_seq.last_value + 1, updated_at = now()
  RETURNING last_value INTO _next;
  RETURN _prefix || '-' || LPAD(_next::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_account_number(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_client_account_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_number IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.account_number := public.allocate_account_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_client_account_number ON public.clients;
CREATE TRIGGER trg_assign_client_account_number
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.assign_client_account_number();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.clients
           WHERE account_number IS NULL AND tenant_id IS NOT NULL
           ORDER BY tenant_id, created_at NULLS LAST, id
  LOOP
    UPDATE public.clients SET account_number = public.allocate_account_number(r.tenant_id) WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.lookup_client_by_account_number(_account_number text)
RETURNS TABLE(
  id uuid, tenant_id uuid, account_number text, linked_user_id uuid,
  first_name text, last_name text, email text, phone text,
  entity_name text, lifecycle_stage text, status text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.tenant_id, c.account_number, c.linked_user_id,
         c.first_name, c.last_name, c.email, c.phone,
         c.entity_name, c.lifecycle_stage::text, c.status::text, c.created_at
  FROM public.clients c
  WHERE c.account_number = _account_number
    AND (public.is_platform_owner() OR c.tenant_id = public.current_user_tenant_id())
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lookup_client_by_account_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_account_number(text) TO authenticated, service_role;
