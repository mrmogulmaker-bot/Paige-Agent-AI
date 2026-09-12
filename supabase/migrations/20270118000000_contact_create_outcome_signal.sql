-- Contact-create outcome signal (Main Paige Operational Chat · P2.1, §947/§9/§37).
--
-- WHY. `create_contact` (20261020010000_client_identity_contract.sql) returns an EXISTING row id
-- on an exact-email match WITHOUT inserting — and again on the unique_violation fallback — in both
-- cases `RETURNS uuid`, indistinguishable from a genuine insert. The chat handler's per-client Rail
-- emit fires on `success === true`, so an already-existing contact currently renders as "created"
-- (a §947 false-create). The caller cannot classify truthfully because the contract hides the fact.
--
-- FIX. `create_contact_v2` carries the SAME logic (same auth gates, same tenant-scoped email dedup,
-- same insert) and additionally returns `was_created` (insert vs resolve) and `client_ref` (the
-- public-safe account_number, resolved INSIDE the transaction under the same `current_user_tenant_id()`
-- the row is written under — which also removes the handler's separate, personaCtx-scoped lookup that
-- could null the ref for an operator acting on another tenant). `create_contact` becomes a one-line
-- scalar shim selecting `contact_id` from v2, so its logic has exactly ONE home and its five existing
-- RPC-return consumers (NewContactDialog / AddInternalClientDialog / ClientManagementDashboard /
-- GrowthHub / growth-process-submission) stay byte-compatible. The inbound MCP door does a direct
-- insert and never calls this RPC, so it is unaffected (§37: six RPC-return consumers, not seven).
--
-- This CREATE OR REPLACE supersedes the original definitions; the original migration file is left
-- untouched (its historical text is unchanged, and its immutability trigger + identity contract
-- remain in force).

CREATE OR REPLACE FUNCTION public.create_contact_v2(
  p_first_name text,
  p_last_name text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_entity_name text DEFAULT NULL::text,
  p_title text DEFAULT NULL::text,
  p_lifecycle_stage text DEFAULT 'new_lead'::text,
  p_source text DEFAULT 'paige'::text,
  p_tags text[] DEFAULT '{}'::text[],
  p_primary_offer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_assigned_coach_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid,
  p_channel text DEFAULT NULL::text)
RETURNS TABLE(contact_id uuid, client_ref text, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _creator uuid := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE p_created_by END;
  _tenant uuid := CASE WHEN auth.uid() IS NOT NULL THEN public.current_user_tenant_id() ELSE p_tenant_id END;
  _id uuid; _existing uuid; _ref text; _email text := NULLIF(btrim(p_email), '');
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
    SELECT id, account_number INTO _existing, _ref FROM public.clients WHERE tenant_id = _tenant AND lower(email) = lower(_email)
      ORDER BY created_at, id LIMIT 1;
    IF _existing IS NOT NULL THEN
      contact_id := _existing; client_ref := _ref; was_created := false; RETURN NEXT; RETURN;
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.clients (first_name,last_name,email,phone,entity_name,title,lifecycle_stage,source,tags,primary_offer,current_notes,assigned_coach_user_id,status,created_by,tenant_id,created_by_channel_type)
  VALUES (COALESCE(NULLIF(btrim(p_first_name),''),NULLIF(split_part(COALESCE(_email,''),'@',1),''),'New'),COALESCE(NULLIF(btrim(p_last_name),''),'Contact'),_email,NULLIF(btrim(p_phone),''),NULLIF(btrim(p_entity_name),''),NULLIF(btrim(p_title),''),COALESCE(NULLIF(p_lifecycle_stage,''),'new_lead'),COALESCE(NULLIF(p_source,''),'paige'),COALESCE(p_tags,'{}'),NULLIF(btrim(p_primary_offer),''),NULLIF(btrim(p_notes),''),p_assigned_coach_user_id,'active',_creator,_tenant,NULLIF(btrim(p_channel),'')) RETURNING id, account_number INTO _id, _ref;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, account_number INTO _existing, _ref FROM public.clients
     WHERE tenant_id = _tenant AND lower(email) = lower(_email)
     ORDER BY created_at, id LIMIT 1;
    IF _existing IS NOT NULL THEN
      contact_id := _existing; client_ref := _ref; was_created := false; RETURN NEXT; RETURN;
    END IF;
    RAISE;
  END;
  INSERT INTO public.audit_logs (user_id,entity,action,entity_id,data) VALUES (_creator,'client','create_contact',_id,jsonb_build_object('tenant_id',_tenant,'source',p_source,'channel',p_channel));
  contact_id := _id; client_ref := _ref; was_created := true; RETURN NEXT; RETURN;
END $$;
REVOKE ALL ON FUNCTION public.create_contact_v2(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact_v2(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) TO authenticated, service_role;

-- Scalar shim: the logic now lives only in v2; this preserves the `RETURNS uuid` wire shape for the
-- five existing RPC-return consumers (and the contract test's `.rpc("create_contact"` assertion).
CREATE OR REPLACE FUNCTION public.create_contact(
  p_first_name text,
  p_last_name text DEFAULT NULL::text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_entity_name text DEFAULT NULL::text,
  p_title text DEFAULT NULL::text,
  p_lifecycle_stage text DEFAULT 'new_lead'::text,
  p_source text DEFAULT 'paige'::text,
  p_tags text[] DEFAULT '{}'::text[],
  p_primary_offer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_assigned_coach_user_id uuid DEFAULT NULL::uuid,
  p_tenant_id uuid DEFAULT NULL::uuid,
  p_created_by uuid DEFAULT NULL::uuid,
  p_channel text DEFAULT NULL::text)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT contact_id FROM public.create_contact_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$$;
REVOKE ALL ON FUNCTION public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contact(text,text,text,text,text,text,text,text,text[],text,text,uuid,uuid,uuid,text) TO authenticated, service_role;
