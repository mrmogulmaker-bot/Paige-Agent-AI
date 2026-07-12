-- Extend plan_list for two parity surfaces (HubSpot/Asana/GHL homework):
--   • p_contact_id  — filter items to one client, so a contact record can show
--                     its own tasks/reminders (the record Tasks tab). Writes
--                     already stamp contact_id; the read couldn't filter by it.
--   • p_by_item_date — switch p_from/p_to from filtering PLANS by their window
--                      to filtering ITEMS by their own due/remind date, so the
--                      calendar can pull every dated item in a visible range
--                      (a plan's window may not overlap an item's due date).
-- Both are additive (default NULL/false); every existing caller is unaffected.
DROP FUNCTION IF EXISTS public.plan_list(text,uuid,text,uuid,date,date,integer,uuid);
CREATE OR REPLACE FUNCTION public.plan_list(
  p_horizon text DEFAULT NULL, p_plan_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_assigned_to_user_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50, p_tenant_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL, p_by_item_date boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _caller uuid := auth.uid(); _tenant uuid; _staff boolean := false; _plans jsonb; _loose jsonb; _lim int;
BEGIN
  IF _caller IS NOT NULL THEN
    _tenant := public.current_user_tenant_id();
    IF NOT public.is_tenant_member(_tenant) THEN RAISE EXCEPTION 'PLAN_FORBIDDEN' USING ERRCODE='42501'; END IF;
    _staff := public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) OR public.is_platform_owner();
  ELSE _tenant := p_tenant_id; IF _tenant IS NULL THEN RAISE EXCEPTION 'PLAN_NO_TENANT' USING ERRCODE='22023'; END IF; _staff := true; END IF;
  _lim := GREATEST(1, LEAST(COALESCE(p_limit,50),200));

  SELECT jsonb_agg(row_to_json(p)::jsonb || jsonb_build_object('items', COALESCE(it.items,'[]'::jsonb)) ORDER BY p.starts_on DESC) INTO _plans
  FROM (
    SELECT * FROM public.plans
     WHERE tenant_id=_tenant
       AND (_staff OR owner_user_id=_caller OR created_by=_caller OR scope='team')
       AND (p_plan_id IS NULL OR id=p_plan_id)
       AND (p_horizon IS NULL OR horizon=p_horizon)
       AND (p_status IS NULL OR status=p_status)
       -- Plan-window filter applies only in the default (plan-window) mode; in
       -- by-item-date mode we keep all plans and filter their items by date.
       AND (p_by_item_date OR ((p_from IS NULL OR ends_on >= p_from) AND (p_to IS NULL OR starts_on <= p_to)))
     ORDER BY starts_on DESC LIMIT _lim
  ) p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.due_at NULLS LAST, i.remind_at NULLS LAST, i.created_at) AS items
      FROM public.plan_items i
     WHERE i.plan_id = p.id
       AND (_staff OR i.assigned_to_user_id=_caller OR i.created_by=_caller)
       AND (p_assigned_to_user_id IS NULL OR i.assigned_to_user_id = p_assigned_to_user_id)
       AND (p_contact_id IS NULL OR i.contact_id = p_contact_id)
       AND (NOT p_by_item_date OR (
            (p_from IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) >= p_from)
        AND (p_to IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) <= p_to)))
       AND i.status <> 'cancelled'
  ) it ON true;

  SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.remind_at NULLS LAST, i.due_at NULLS LAST, i.created_at) INTO _loose
  FROM public.plan_items i
  WHERE i.tenant_id=_tenant
    AND i.plan_id IS NULL
    AND (_staff OR i.assigned_to_user_id=_caller OR i.created_by=_caller)
    AND (p_assigned_to_user_id IS NULL OR i.assigned_to_user_id = p_assigned_to_user_id)
    AND (p_contact_id IS NULL OR i.contact_id = p_contact_id)
    AND (p_status IS NULL OR i.status = p_status)
    AND i.status <> 'cancelled'
    AND (p_from IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) >= p_from)
    AND (p_to IS NULL OR COALESCE(i.due_at::date, i.remind_at::date) <= p_to)
  LIMIT _lim;

  RETURN jsonb_build_object('plans', COALESCE(_plans,'[]'::jsonb), 'loose_items', COALESCE(_loose,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.plan_list(text,uuid,text,uuid,date,date,integer,uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_list(text,uuid,text,uuid,date,date,integer,uuid,uuid,boolean) TO authenticated, service_role;