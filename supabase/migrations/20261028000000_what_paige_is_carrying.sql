-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- paige_operating_memory() — what Paige is currently carrying, composed rather than stored.
--
-- THE GAP. Everything needed to answer "what do I owe you, what is running, and what did I last
-- do" already exists, in four places, and nothing reads them together:
--
--   plan_items        open commitments — the tasks, milestones and reminders she filed
--   paige_automations the repeatable processes the operator has armed (§67)
--   paige_actions     work in flight on the action bus, including what waits on an approval
--   paige_audit_log   what she actually did, on whose authority, and whether it worked (C1)
--
-- So Paige opened every conversation able to read the transcript and nothing else. A transcript is
-- not memory: it is what was SAID, not what is OWED, and it does not survive a new thread, a
-- compaction, or a person coming back a week later. This composes the four into one bounded read.
--
-- NOTHING IS STORED HERE. There is no fifth table and no copy that can go stale — a commitment is
-- wherever it already lived, and this is a view of it. That is deliberate: a summary table would
-- need writers on every one of those four paths and would be wrong the moment one was missed.
--
-- §9 / §588 — SCOPE IS DERIVED, NEVER PASSED. The tenant comes from `current_user_tenant_id()` and
-- the person from `auth.uid()`. There is no tenant parameter, so no caller can aim this at another
-- tenant, and the resolver keys on the session rather than on anything in a request body.
--
-- §59 — SECURITY INVOKER, deliberately. Every table read here is one the caller already reaches
-- through RLS, so DEFINER would be bypassing policies for no reason and would oblige this body to
-- re-implement four separate isolation rules correctly and forever. As INVOKER, RLS stays the
-- boundary and this function cannot widen it: a coach sees what a coach sees, and the audit
-- section shows a non-admin only their own actions, which is the correct answer to "what have I
-- done" anyway.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.paige_operating_memory(
  p_contact_id uuid DEFAULT NULL,   -- narrow to one client when a client is in focus
  p_limit      integer DEFAULT 8
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
  -- WHAT SHE OWES. Open work assigned to this person, soonest first. `due_at NULLS LAST` because
  -- an undated commitment is real but not urgent, and burying the dated ones under it is how a
  -- list stops being read.
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
  -- WHAT RUNS WITHOUT HER BEING ASKED. `granted_lane` is carried because "this is armed" and
  -- "this is armed to act alone" are different facts and a person reading the two must not have
  -- to guess which they are looking at.
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
  -- WHAT IS MID-FLIGHT, including anything stopped at an approval.
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
  -- WHAT SHE LAST DID, AND WHETHER IT WORKED. From the write trail, so this reports what actually
  -- happened rather than what a transcript claimed — a fire is not a delivery (§13).
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
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'tenant_id', (SELECT tid FROM me),
      'user_id',   (SELECT uid FROM me),
      'contact_id', p_contact_id
    ),
    -- `'[]'` rather than null on every section: "nothing open" is an ANSWER, and a caller that has
    -- to tell an empty list from a missing key will eventually get it wrong in the direction of
    -- inventing something to say.
    'commitments', COALESCE((SELECT j FROM commitments), '[]'::jsonb),
    'processes',   COALESCE((SELECT j FROM processes),   '[]'::jsonb),
    'in_flight',   COALESCE((SELECT j FROM in_flight),   '[]'::jsonb),
    'recent',      COALESCE((SELECT j FROM recent),      '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.paige_operating_memory(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_operating_memory(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.paige_operating_memory(uuid, integer) IS
  'What Paige is carrying for the CALLING person in their ACTIVE tenant: open commitments, live '
  'processes, work in flight, and what she last did with its real outcome. Composed from the '
  'existing records, never stored. Scope is derived from auth.uid() and current_user_tenant_id(); '
  'there is deliberately no tenant parameter. SECURITY INVOKER, so RLS remains the boundary.';
