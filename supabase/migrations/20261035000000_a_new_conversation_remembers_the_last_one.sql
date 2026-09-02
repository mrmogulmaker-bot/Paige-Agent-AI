-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A new conversation starts knowing what the last one committed to.
--
-- THE GAP, MEASURED ON PRODUCTION 2026-09-01. Within a single thread, continuity works: 35 threads,
-- 14 long enough to fold, 6 already compacted, the longest 105 messages, and the rolling summary
-- preserves decisions, queued actions, open approvals and open loops by design.
--
-- Across threads it does not exist. One tenant holds 18 threads and 277 turns, 8 of them carrying
-- folded context, and every new conversation opens blank. The charter's words are "a future session
-- must recover authorized context, current plan, next promised action" — the recovery is per-thread
-- today, and a person who starts a new chat is a future session.
--
-- WHY THIS EXTENDS `paige_operating_memory` RATHER THAN ADDING A READ (§18). That function already
-- derives its scope the only way that is safe, already narrows on the focused client, is already
-- called once per turn on the caller's own client, and its result is already rendered into BOTH
-- prompt paths. A second function would duplicate all four and would be the one that drifts. The
-- three memory layers the charter names stay distinct in MEANING — conversation continuity, client
-- facts, operating state — without being three separate reads.
--
-- THE CROSS-CLIENT RULE, which is the load-bearing part. A thread summary is prose about a
-- conversation, so carrying the wrong one is a disclosure rather than a nuisance. The predicate is
-- `p_contact_id IS NULL OR t.contact_id = p_contact_id` — the SAME one every other section uses,
-- deliberately, so there is one rule to reason about:
--
--   • a client in focus   → only threads about THAT client. Client X's conversation can never
--                           surface while working on client Y, which is the bleed the charter names.
--   • no client in focus  → the operator's own general workspace, unnarrowed, exactly as
--                           `commitments` and `in_flight` already behave there.
--
-- Isolation beyond that is RLS's, not this function's (§59): SECURITY INVOKER is retained, so
-- `threads_tenant_isolation` (RESTRICTIVE) and `threads_select_owner_or_admin` decide whose threads
-- are visible. Re-implementing that here would be a second copy of a rule that already exists.
--
-- §13 — WHAT A SUMMARY IS. Model-written prose about a conversation, not a verified record. It is
-- labelled as such where it is rendered, because the durable facts live in `commitments`,
-- `in_flight` and `recent`, which come from real rows. A summary is what was DISCUSSED; the other
-- sections are what is OWED and what HAPPENED, and a reader must not confuse the two.
--
-- SIGNATURE CHANGE, and why a DROP. `p_exclude_thread_id` cannot be added as a third defaulted
-- parameter: the 2-argument function would remain, and a 2-argument call would then be ambiguous
-- between them. So the old signature is dropped in the same transaction. Its one production caller
-- (`paige-ai-chat`) is updated in this same change; the §37 inventory found no other — no view, no
-- trigger, no cron, no sibling edge function, no MCP tool.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.paige_operating_memory(uuid, integer);

CREATE OR REPLACE FUNCTION public.paige_operating_memory(
  p_contact_id        uuid DEFAULT NULL,   -- narrow to one client when a client is in focus
  p_limit             integer DEFAULT 8,
  p_exclude_thread_id uuid DEFAULT NULL    -- the thread being composed; its own summary is already injected
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
               'awaiting_approval', ac.status = 'pending_approval'
             ) AS x
      FROM public.paige_actions ac, me
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
$$;

REVOKE ALL ON FUNCTION public.paige_operating_memory(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_operating_memory(uuid, integer, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.paige_operating_memory(uuid, integer, uuid) IS
  'What Paige is carrying for the CALLING person in their ACTIVE tenant: open commitments, live '
  'processes, work in flight, what she last did with its real outcome, and the folded summaries of '
  'her recent OTHER conversations so a new thread does not open blank. Composed from the existing '
  'records, never stored. Scope is derived from auth.uid() and current_user_tenant_id(); there is '
  'deliberately no tenant parameter. Every section narrows on the focused client by the same rule, '
  'so one client''s conversation can never surface while working on another. SECURITY INVOKER, so '
  'RLS remains the boundary.';
