-- Post-audit remediation for the planning/reminder build. Fixes found by the
-- adversarial audit crew:
--   1. plan_update_item never cleared reminded_at → a rescheduled reminder
--      silently never fired again, while the tool promised it would (honesty).
--   2. plan_update_item let a non-staff member reassign their own task to a
--      teammate, bypassing the staff-only gate that plan_assign_task enforces.
--   3. plan_list is SECURITY DEFINER and bypassed RLS, returning EVERY member's
--      private plans/items to any member; and it only returned items attached to
--      a plan, so standalone reminders ("what reminders do I have") never showed.
--   4. plan_set_reminder had no contact_id, so a sales-rep "remind me to follow
--      up with this lead" dropped the client link the owner asked for.

-- ── (1)+(2) plan_update_item ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plan_update_item(
  p_item_id uuid, p_status text DEFAULT NULL, p_title text DEFAULT NULL,
  p_summary text DEFAULT NULL, p_due_at timestamptz DEFAULT NULL,
  p_remind_at timestamptz DEFAULT NULL, p_priority text DEFAULT NULL,
  p_assigned_to_user_id uuid DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _row public.plan_items%ROWTYPE; _staff boolean := false;
BEGIN
  SELECT * INTO _row FROM public.plan_items WHERE id=p_item_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'PLAN_ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _caller IS NOT NULL THEN
    IF NOT (_row.tenant_id = public.current_user_tenant_id() OR public.is_platform_owner()) THEN RAISE EXCEPTION 'PLAN_FORBIDDEN: wrong tenant' USING ERRCODE='42501'; END IF;
    _staff := public.has_any_role(_caller, ARRAY['admin','super_admin','coach']);
    IF NOT (_staff OR _row.assigned_to_user_id = _caller OR _row.created_by = _caller) THEN RAISE EXCEPTION 'PLAN_FORBIDDEN: not your item' USING ERRCODE='42501'; END IF;
  ELSE
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _row.tenant_id THEN RAISE EXCEPTION 'PLAN_FORBIDDEN: tenant mismatch' USING ERRCODE='42501'; END IF;
    _staff := true;
  END IF;
  IF NOT _staff AND _row.created_by IS DISTINCT FROM _caller
     AND (p_title IS NOT NULL OR p_summary IS NOT NULL OR p_due_at IS NOT NULL OR p_remind_at IS NOT NULL OR p_priority IS NOT NULL OR p_assigned_to_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'PLAN_FORBIDDEN: assignee may only change status' USING ERRCODE='42501'; END IF;
  -- (2) Reassigning work to a DIFFERENT person is staff-only — an individual
  -- cannot push a task (and its notification) onto a teammate's queue.
  IF p_assigned_to_user_id IS NOT NULL AND p_assigned_to_user_id IS DISTINCT FROM _row.assigned_to_user_id AND NOT _staff THEN
    RAISE EXCEPTION 'PLAN_FORBIDDEN: reassigning needs admin or coach' USING ERRCODE='42501'; END IF;
  IF p_assigned_to_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id=p_assigned_to_user_id AND tenant_id=_row.tenant_id AND status='active') THEN
    RAISE EXCEPTION 'PLAN_ASSIGNEE_NOT_IN_TENANT' USING ERRCODE='42501'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open','in_progress','done','cancelled','blocked') THEN RAISE EXCEPTION 'PLAN_BAD_STATUS' USING ERRCODE='22023'; END IF;
  UPDATE public.plan_items SET
    status = COALESCE(p_status, status),
    title = COALESCE(NULLIF(btrim(p_title),''), title),
    summary = COALESCE(p_summary, summary),
    due_at = COALESCE(p_due_at, due_at),
    remind_at = COALESCE(p_remind_at, remind_at),
    priority = COALESCE(p_priority, priority),
    assigned_to_user_id = COALESCE(p_assigned_to_user_id, assigned_to_user_id),
    -- (1) Moving a reminder's time to the future re-arms it: clear the dispatch
    -- stamp so the runner picks it up again. This makes the tool's "it can fire
    -- again" promise actually true.
    reminded_at = CASE WHEN p_remind_at IS NOT NULL AND p_remind_at > now() THEN NULL ELSE reminded_at END,
    completed_at = CASE WHEN p_status='done' THEN now() ELSE completed_at END,
    resolved_at  = CASE WHEN p_status IN ('done','cancelled') THEN now()
                        WHEN p_remind_at IS NOT NULL AND p_remind_at > now() THEN NULL
                        ELSE resolved_at END
  WHERE id=p_item_id;
  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller,'plan_item','plan_update_item',p_item_id, jsonb_build_object('status',p_status,'staff',_staff));
  RETURN jsonb_build_object('ok',true,'item_id',p_item_id,'status',COALESCE(p_status,_row.status));
END $$;

-- ── (3) plan_list — per-caller visibility + standalone items ──────────────────
CREATE OR REPLACE FUNCTION public.plan_list(
  p_horizon text DEFAULT NULL, p_plan_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_assigned_to_user_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _staff boolean := false; _plans jsonb; _loose jsonb; _lim int;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF NOT public.is_tenant_member(_tenant) THEN RAISE EXCEPTION 'PLAN_FORBIDDEN' USING ERRCODE='42501'; END IF;
    _staff := public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) OR public.is_platform_owner();
  ELSE _tenant := p_tenant_id; IF _tenant IS NULL THEN RAISE EXCEPTION 'PLAN_NO_TENANT' USING ERRCODE='22023'; END IF; _staff := true; END IF;
  _lim := GREATEST(1, LEAST(COALESCE(p_limit,50),200));

  -- Plans the caller may see: staff see all in-tenant; a member sees their own
  -- plus any team-scoped plan. SECURITY DEFINER bypasses RLS, so this predicate
  -- is what enforces the read policy (never leak a teammate's private plan).
  SELECT jsonb_agg(row_to_json(p)::jsonb || jsonb_build_object('items', COALESCE(it.items,'[]'::jsonb)) ORDER BY p.starts_on DESC) INTO _plans
  FROM (
    SELECT * FROM public.plans
     WHERE tenant_id=_tenant
       AND (_staff OR owner_user_id=_caller OR created_by=_caller OR scope='team')
       AND (p_plan_id IS NULL OR id=p_plan_id)
       AND (p_horizon IS NULL OR horizon=p_horizon)
       AND (p_status IS NULL OR status=p_status)
       AND (p_from IS NULL OR ends_on >= p_from)
       AND (p_to IS NULL OR starts_on <= p_to)
     ORDER BY starts_on DESC LIMIT _lim
  ) p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.due_at NULLS LAST, i.remind_at NULLS LAST, i.created_at) AS items
      FROM public.plan_items i
     WHERE i.plan_id = p.id
       AND (_staff OR i.assigned_to_user_id=_caller OR i.created_by=_caller)
       AND (p_assigned_to_user_id IS NULL OR i.assigned_to_user_id = p_assigned_to_user_id)
       AND i.status <> 'cancelled'
  ) it ON true;

  -- Standalone items (no plan): the "what reminders/tasks do I have" bucket —
  -- these are what plan_set_reminder / a loose plan_assign_task create. Same
  -- per-caller visibility. Without this, a "set a reminder" was invisible to
  -- "show my reminders".
  SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.remind_at NULLS LAST, i.due_at NULLS LAST, i.created_at) INTO _loose
  FROM public.plan_items i
  WHERE i.tenant_id=_tenant
    AND i.plan_id IS NULL
    AND (_staff OR i.assigned_to_user_id=_caller OR i.created_by=_caller)
    AND (p_assigned_to_user_id IS NULL OR i.assigned_to_user_id = p_assigned_to_user_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND i.status <> 'cancelled'
    AND (p_from IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) >= p_from)
    AND (p_to IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) <= p_to)
  LIMIT _lim;

  RETURN jsonb_build_object('plans', COALESCE(_plans,'[]'::jsonb), 'loose_items', COALESCE(_loose,'[]'::jsonb));
END $$;

-- ── (4) plan_set_reminder — carry the client link ────────────────────────────
DROP FUNCTION IF EXISTS public.plan_set_reminder(text,timestamptz,text,uuid,text,uuid,text,uuid);
CREATE OR REPLACE FUNCTION public.plan_set_reminder(
  p_title text, p_remind_at timestamptz, p_target text DEFAULT 'user',
  p_target_user_id uuid DEFAULT NULL, p_channel text DEFAULT 'in_app',
  p_plan_id uuid DEFAULT NULL, p_summary text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _staff boolean := false; _assignee uuid; _id uuid;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> _tenant THEN RAISE EXCEPTION 'PLAN_FORBIDDEN: tenant mismatch' USING ERRCODE='42501'; END IF;
    IF NOT public.is_tenant_member(_tenant) THEN RAISE EXCEPTION 'PLAN_FORBIDDEN: not a member' USING ERRCODE='42501'; END IF;
    _staff := public.has_any_role(_caller, ARRAY['admin','super_admin','coach']);
  ELSE _tenant := p_tenant_id; IF _tenant IS NULL THEN RAISE EXCEPTION 'PLAN_NO_TENANT' USING ERRCODE='22023'; END IF; _staff := true; END IF;
  IF p_remind_at IS NULL THEN RAISE EXCEPTION 'PLAN_REMINDER_TIME_REQUIRED' USING ERRCODE='22023'; END IF;
  _assignee := CASE WHEN COALESCE(p_target,'user')='team' THEN NULL ELSE COALESCE(p_target_user_id, _caller) END;
  IF NOT _staff AND (COALESCE(p_target,'user')='team' OR _assignee IS DISTINCT FROM _caller) THEN
    RAISE EXCEPTION 'PLAN_FORBIDDEN: team/other reminders need admin or coach' USING ERRCODE='42501'; END IF;
  IF _assignee IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id=_assignee AND tenant_id=_tenant AND status='active') THEN
    RAISE EXCEPTION 'PLAN_ASSIGNEE_NOT_IN_TENANT' USING ERRCODE='42501'; END IF;
  IF p_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.plans WHERE id=p_plan_id AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'PLAN_NOT_IN_TENANT' USING ERRCODE='42501'; END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id=p_contact_id AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'PLAN_CONTACT_NOT_IN_TENANT' USING ERRCODE='42501'; END IF;
  INSERT INTO public.plan_items(tenant_id, plan_id, item_type, title, summary, remind_at, remind_channel, remind_target, assigned_to_user_id, contact_id, created_by)
  VALUES (_tenant, p_plan_id, 'reminder', btrim(p_title), p_summary, p_remind_at, COALESCE(p_channel,'in_app'), COALESCE(p_target,'user'), _assignee, p_contact_id, _caller)
  RETURNING id INTO _id;
  INSERT INTO public.audit_logs(user_id, entity, action, entity_id, data)
  VALUES (_caller,'plan_item','plan_set_reminder',_id, jsonb_build_object('tenant_id',_tenant,'target',p_target,'remind_at',p_remind_at,'contact_id',p_contact_id));
  RETURN jsonb_build_object('ok',true,'item_id',_id,'item_type','reminder','remind_at',p_remind_at);
END $$;
REVOKE ALL ON FUNCTION public.plan_set_reminder(text,timestamptz,text,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_set_reminder(text,timestamptz,text,uuid,text,uuid,text,uuid,uuid) TO authenticated, service_role;