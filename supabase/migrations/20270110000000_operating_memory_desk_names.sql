-- =============================================================================
-- Stage 2 (decision #19): the COO briefing book carries the DESK names.
--
-- in_flight rows now expose `desk`: the assigned specialist's PARENT VP's
-- display name (CURA / ZION / ...) when parented, the specialist's own name
-- when unparented, NULL when unassigned — rendered by paige-ai-chat as
-- "CURA — <title> — WAITING ON THEIR APPROVAL". Owner ruling: Paige is the
-- AI COO who briefs the CEO in names, not action ids.
--
-- Verbatim replace of the live function (pg_get_functiondef 2026-09-11) with
-- ONLY the in_flight projection changed; caller-scoped semantics (auth.uid +
-- current_user_tenant_id), STABLE, search_path preserved exactly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.paige_operating_memory(p_contact_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 8, p_exclude_thread_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid, public.current_user_tenant_id() AS tid
  ),
  commitments AS (
    SELECT jsonb_agg(x ORDER BY x->>'due_at' NULLS LAST) AS j FROM (
      SELECT jsonb_build_object(
               'id', pi.id, 'kind', pi.item_type, 'title', pi.title,
               'status', pi.status, 'due_at', pi.due_at, 'priority', pi.priority,
               'contact_id', pi.contact_id
             ) AS x
      FROM public.plan_items pi, me
      WHERE pi.tenant_id = me.tid
        AND pi.status IN ('open','in_progress','blocked')
        AND (pi.assigned_to_user_id = me.uid OR pi.created_by = me.uid)
        AND (p_contact_id IS NULL OR pi.contact_id = p_contact_id)
      ORDER BY pi.due_at NULLS LAST, pi.created_at DESC
      LIMIT p_limit
    ) s
  ),
  processes AS (
    SELECT jsonb_agg(x) AS j FROM (
      SELECT jsonb_build_object(
               'id', a.id, 'name', a.name, 'trigger', a.trigger_key,
               'state', a.state, 'granted_lane', a.granted_lane
             ) AS x
      FROM public.paige_automations a, me
      WHERE a.tenant_id = me.tid AND a.state = 'live'
      ORDER BY a.updated_at DESC
      LIMIT p_limit
    ) s
  ),
  in_flight AS (
    SELECT jsonb_agg(x) AS j FROM (
      SELECT jsonb_build_object(
               'id', ac.id, 'title', ac.title, 'status', ac.status,
               'priority', ac.priority, 'department', ac.to_department,
               'contact_id', ac.contact_id,
               'awaiting_approval', ac.status = 'pending_approval',
               'desk', COALESCE(vp.rail_display_name, spec.rail_display_name)
             ) AS x
      FROM public.paige_actions ac
      CROSS JOIN me
      LEFT JOIN public.paige_subagents spec ON spec.slug = ac.assigned_subagent_slug
      LEFT JOIN public.paige_subagents vp ON vp.slug = spec.parent_subagent_slug
      WHERE ac.tenant_id = me.tid
        AND ac.status NOT IN ('done','dismissed','expired','failed')
        AND (p_contact_id IS NULL OR ac.contact_id = p_contact_id)
      ORDER BY ac.created_at DESC
      LIMIT p_limit
    ) s
  ),
  recent AS (
    SELECT jsonb_agg(x) AS j FROM (
      SELECT jsonb_build_object(
               'action', al.action, 'target_type', al.target_type, 'target_id', al.target_id,
               'outcome', al.payload->>'outcome',
               'authorised_by', al.payload->>'authorised_by',
               'at', al.created_at
             ) AS x
      FROM public.paige_audit_log al, me
      WHERE al.tenant_id = me.tid
        AND al.payload->>'source' = 'paige_chat'
      ORDER BY al.created_at DESC
      LIMIT p_limit
    ) s
  ),
  -- WHAT WAS ALREADY DISCUSSED, in earlier conversations that are not this one.
  --
  -- `summary IS NOT NULL` is the whole admission test: a thread that has never been folded has no
  -- durable account of itself, and its raw turns are not this function's to relay. `is_archived`
  -- is excluded because archiving is a person saying they are done with it.
  --
  -- The current thread is excluded so its own summary is not handed back to it — that summary is
  -- already injected separately by the caller, and echoing it would spend budget restating what is
  -- in front of the model. `IS DISTINCT FROM` rather than `<>` so a NULL exclusion id (no thread
  -- yet, which is exactly the new-conversation case) excludes nothing instead of everything.
  continuity AS (
    SELECT jsonb_agg(x ORDER BY x->>'last_active' DESC) AS j FROM (
      SELECT jsonb_build_object(
               'thread_id', t.id,
               'title', t.title,
               'summary', t.summary,
               'contact_id', t.contact_id,
               'last_active', t.last_message_at,
               'turns', t.message_count
             ) AS x
      FROM public.paige_chat_threads t, me
      WHERE t.tenant_id = me.tid
        AND t.summary IS NOT NULL
        AND NOT t.is_archived
        AND t.id IS DISTINCT FROM p_exclude_thread_id
        AND (p_contact_id IS NULL OR t.contact_id = p_contact_id)
      ORDER BY t.last_message_at DESC NULLS LAST
      LIMIT LEAST(p_limit, 3)   -- prose is expensive; three recent threads is continuity, ten is a wall
    ) s
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'tenant_id', (SELECT tid FROM me),
      'user_id',   (SELECT uid FROM me),
      'contact_id', p_contact_id
    ),
    'commitments', COALESCE((SELECT j FROM commitments), '[]'::jsonb),
    'processes',   COALESCE((SELECT j FROM processes),   '[]'::jsonb),
    'in_flight',   COALESCE((SELECT j FROM in_flight),   '[]'::jsonb),
    'recent',      COALESCE((SELECT j FROM recent),      '[]'::jsonb),
    'continuity',  COALESCE((SELECT j FROM continuity),  '[]'::jsonb)
  );
$function$


