-- Client identity contract: one immutable server UUID + one immutable public-safe
-- reference, both bound to exactly one tenant. Abort instead of guessing ownership.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.clients WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'historical_client_missing_tenant';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_account_number(_tenant_id uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _candidate text;
BEGIN
  IF _tenant_id IS NULL THEN RAISE EXCEPTION 'client_tenant_required' USING ERRCODE = '23502'; END IF;
  FOR _attempt IN 1..20 LOOP
    _candidate := 'CLT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE account_number = _candidate) THEN RETURN _candidate; END IF;
  END LOOP;
  RAISE EXCEPTION 'client_reference_allocation_exhausted';
END $$;
REVOKE ALL ON FUNCTION public.allocate_account_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_account_number(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_client_account_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'client_tenant_required' USING ERRCODE = '23502'; END IF;
  IF NEW.account_number IS NULL THEN NEW.account_number := public.allocate_account_number(NEW.tenant_id); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_client_account_number() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE _row record; BEGIN
  FOR _row IN SELECT id, tenant_id FROM public.clients WHERE account_number IS NULL FOR UPDATE LOOP
    UPDATE public.clients SET account_number = public.allocate_account_number(_row.tenant_id) WHERE id = _row.id;
  END LOOP;
END $$;

ALTER TABLE public.clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.clients ALTER COLUMN account_number SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_client_identity_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.account_number IS DISTINCT FROM NEW.account_number THEN
    RAISE EXCEPTION 'client_identity_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_identity_immutable ON public.clients;
CREATE TRIGGER trg_client_identity_immutable BEFORE UPDATE OF id, tenant_id, account_number ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_identity_immutable();

REVOKE INSERT ON TABLE public.clients FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_contact(p_first_name text, p_last_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_entity_name text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_lifecycle_stage text DEFAULT 'new_lead'::text, p_source text DEFAULT 'paige'::text, p_tags text[] DEFAULT '{}'::text[], p_primary_offer text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_assigned_coach_user_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _creator uuid := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE p_created_by END;
  _tenant uuid := CASE WHEN auth.uid() IS NOT NULL THEN public.current_user_tenant_id() ELSE p_tenant_id END;
  _id uuid; _existing uuid; _email text := NULLIF(btrim(p_email), '');
BEGIN
  IF _creator IS NULL THEN RAISE EXCEPTION 'CONTACT_NO_OPERATOR' USING ERRCODE = '42501'; END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'CONTACT_NO_TENANT' USING ERRCODE = '22023'; END IF;
  IF NOT public.has_any_role(_creator, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _caller IS NOT NULL AND NOT public.is_platform_owner() AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = _tenant AND tm.user_id = _caller AND tm.status = 'active'
  ) THEN RAISE EXCEPTION 'CONTACT_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF _email IS NOT NULL THEN
    SELECT id INTO _existing FROM public.clients WHERE tenant_id = _tenant AND lower(email) = lower(_email)
      ORDER BY created_at, id LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
  END IF;
  BEGIN
    INSERT INTO public.clients (first_name,last_name,email,phone,entity_name,title,lifecycle_stage,source,tags,primary_offer,current_notes,assigned_coach_user_id,status,created_by,tenant_id,created_by_channel_type)
  VALUES (COALESCE(NULLIF(btrim(p_first_name),''),NULLIF(split_part(COALESCE(_email,''),'@',1),''),'New'),COALESCE(NULLIF(btrim(p_last_name),''),'Contact'),_email,NULLIF(btrim(p_phone),''),NULLIF(btrim(p_entity_name),''),NULLIF(btrim(p_title),''),COALESCE(NULLIF(p_lifecycle_stage,''),'new_lead'),COALESCE(NULLIF(p_source,''),'paige'),COALESCE(p_tags,'{}'),NULLIF(btrim(p_primary_offer),''),NULLIF(btrim(p_notes),''),p_assigned_coach_user_id,'active',_creator,_tenant,NULLIF(btrim(p_channel),'')) RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _existing FROM public.clients
     WHERE tenant_id = _tenant AND lower(email) = lower(_email)
     ORDER BY created_at, id LIMIT 1;
    IF _existing IS NOT NULL THEN RETURN _existing; END IF;
    RAISE;
  END;
  INSERT INTO public.audit_logs (user_id,entity,action,entity_id,data) VALUES (_creator,'client','create_contact',_id,jsonb_build_object('tenant_id',_tenant,'source',p_source,'channel',p_channel));
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_client_reference(p_client_ref text)
RETURNS TABLE(id uuid, client_ref text, first_name text, last_name text, entity_name text, lifecycle_stage text, status text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id,c.account_number,c.first_name,c.last_name,c.entity_name,c.lifecycle_stage,c.status
  FROM public.clients c WHERE auth.uid() IS NOT NULL AND c.tenant_id = public.current_user_tenant_id()
    AND upper(c.account_number) = upper(btrim(p_client_ref)) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.resolve_client_reference(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_client_reference(text) TO authenticated;

COMMENT ON COLUMN public.clients.id IS 'Immutable internal server-generated UUID; never a primary user- or model-facing identifier.';
COMMENT ON COLUMN public.clients.tenant_id IS 'Immutable owning tenant; required for every client row.';
COMMENT ON COLUMN public.clients.account_number IS 'Immutable public-safe client reference; existing values preserved, new values nonsequential CLT tokens.';
