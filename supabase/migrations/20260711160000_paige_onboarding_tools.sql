-- Paige onboarding action seams (#121) — so her probes become real moves: assign a
-- client to a teammate, and enroll a client into a program/offer. Plus two read seams
-- (team roster, program/offer catalog) so she can resolve "assign to the coach named X"
-- and lead with the right offer. All SECURITY DEFINER dual-caller, tenant-isolated the
-- same way the action bus is (JWT caller pinned to their own tenant — the p_tenant_id
-- IDOR class stays closed; the trusted service/Paige path passes p_tenant_id). Role-gated
-- admin|coach. Tenant-generic (§2). Welcome messages route through the existing action
-- bus (owner.followup_email → approval); automation enrollment is a fast-follow.

-- (A) list_team_members — who Paige can assign work to. Names resolved from profiles.
CREATE OR REPLACE FUNCTION public.list_team_members(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, name text, role text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF NOT (public.is_tenant_member(_tenant) AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])) THEN
      RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'TEAM_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  RETURN QUERY
    SELECT tm.user_id,
           COALESCE(NULLIF(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.full_name, 'Team member')::text AS name,
           tm.role::text, tm.status::text
      FROM public.tenant_members tm
      LEFT JOIN public.profiles pr ON pr.user_id = tm.user_id
     WHERE tm.tenant_id = _tenant AND tm.status::text = 'active'
     ORDER BY name;
END $$;

-- (B) assign_contact — set the owning teammate for a contact. role picks the column:
-- coach → assigned_coach_user_id, owner → lead_owner_user_id, cs → cs_primary_user_id.
CREATE OR REPLACE FUNCTION public.assign_contact(
  p_contact_id uuid,
  p_user_id    uuid,
  p_role       text DEFAULT 'coach',
  p_tenant_id  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _role text := lower(COALESCE(p_role,'coach'));
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant THEN
      RAISE EXCEPTION 'ASSIGN_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_tenant_member(_tenant) AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])) THEN
      RAISE EXCEPTION 'ASSIGN_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'ASSIGN_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_contact_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'ASSIGN_CONTACT_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = p_user_id AND tenant_id = _tenant AND status = 'active') THEN
    RAISE EXCEPTION 'ASSIGN_ASSIGNEE_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  IF _role IN ('coach','coach_user','assigned_coach') THEN
    UPDATE public.clients SET assigned_coach_user_id = p_user_id WHERE id = p_contact_id;
  ELSIF _role IN ('owner','lead_owner','sales','sales_rep','rep') THEN
    UPDATE public.clients SET lead_owner_user_id = p_user_id WHERE id = p_contact_id;
  ELSIF _role IN ('cs','success','client_success','cs_primary') THEN
    UPDATE public.clients SET cs_primary_user_id = p_user_id WHERE id = p_contact_id;
  ELSE
    UPDATE public.clients SET assigned_coach_user_id = p_user_id WHERE id = p_contact_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (COALESCE(_caller, p_user_id), 'client', 'assign_contact', p_contact_id,
          jsonb_build_object('tenant_id', _tenant, 'assignee', p_user_id, 'role', _role));

  RETURN jsonb_build_object('ok', true, 'contact_id', p_contact_id, 'assignee', p_user_id, 'role', _role);
END $$;

-- (C) list_tenant_programs — the programs + offers loaded for the tenant, priority first
-- (priority read from metadata->>'priority' so #122's flag drops in without a schema change).
CREATE OR REPLACE FUNCTION public.list_tenant_programs(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(kind text, id uuid, name text, description text, status text, is_priority boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF NOT (public.is_tenant_member(_tenant) AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])) THEN
      RAISE EXCEPTION 'PROGRAM_FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'PROGRAM_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  RETURN QUERY
    SELECT q.kind, q.id, q.name, q.description, q.status, q.is_priority FROM (
      SELECT 'program'::text AS kind, pg.id, pg.name::text AS name, pg.description::text AS description, pg.status::text AS status,
             COALESCE((pg.metadata->>'priority')::boolean, false) AS is_priority
        FROM public.programs pg WHERE pg.tenant_id = _tenant AND COALESCE(pg.status::text,'active') <> 'archived'
      UNION ALL
      SELECT 'product'::text, tp.id, tp.name::text, tp.description::text, tp.status::text,
             COALESCE((tp.metadata->>'priority')::boolean, false)
        FROM public.tenant_products tp WHERE tp.tenant_id = _tenant AND COALESCE(tp.status::text,'active') <> 'archived'
    ) q
    ORDER BY q.is_priority DESC, q.name;
END $$;

-- (D) enroll_contact_in_program — place a client into a program. Idempotent.
CREATE OR REPLACE FUNCTION public.enroll_contact_in_program(
  p_contact_id uuid,
  p_program_id uuid,
  p_tenant_id  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _eid uuid; _existing uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant THEN
      RAISE EXCEPTION 'ENROLL_FORBIDDEN: tenant mismatch' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_tenant_member(_tenant) AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach'])) THEN
      RAISE EXCEPTION 'ENROLL_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
    END IF;
  ELSE
    _tenant := p_tenant_id;
    IF _tenant IS NULL THEN RAISE EXCEPTION 'ENROLL_NO_TENANT' USING ERRCODE = '22023'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_contact_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'ENROLL_CONTACT_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id AND tenant_id = _tenant) THEN
    RAISE EXCEPTION 'ENROLL_PROGRAM_NOT_IN_TENANT' USING ERRCODE = '42501';
  END IF;

  -- Idempotent + race-safe: ON CONFLICT handles a concurrent double-enroll.
  INSERT INTO public.program_enrollments (program_id, client_id, status, enrolled_at)
  VALUES (p_program_id, p_contact_id, 'active', now())
  ON CONFLICT (program_id, client_id) DO NOTHING
  RETURNING id INTO _eid;

  IF _eid IS NULL THEN
    SELECT id INTO _eid FROM public.program_enrollments
     WHERE program_id = p_program_id AND client_id = p_contact_id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'enrollment_id', _eid, 'already', true);
  END IF;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'program_enrollment', 'enroll_contact_in_program', _eid,
          jsonb_build_object('tenant_id', _tenant, 'contact_id', p_contact_id, 'program_id', p_program_id));

  RETURN jsonb_build_object('ok', true, 'enrollment_id', _eid);
END $$;

REVOKE ALL ON FUNCTION public.list_team_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_team_members(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_contact(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_contact(uuid, uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_tenant_programs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_programs(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enroll_contact_in_program(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_contact_in_program(uuid, uuid, uuid) TO authenticated, service_role;
