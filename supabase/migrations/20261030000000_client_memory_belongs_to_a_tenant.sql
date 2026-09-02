-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- client_memory: a memory about a client belongs to the tenant that client belongs to.
--
-- THE DEFECT, read off production. `client_memory` has NO tenant column, NO restrictive policy,
-- and its widest policy is:
--
--     "Admins have full access to client_memory"  FOR ALL  USING has_role(auth.uid(), 'admin')
--
-- `user_roles` has no tenant column, so `has_role(…, 'admin')` is TENANT-AGNOSTIC (§59's named
-- trap, §53's rule). With nothing restrictive to intersect it, **any tenant-level admin, in any
-- tenant, has full read and write access to every client's memory on the platform.** There is no
-- tenant predicate anywhere on this table.
--
-- The table holds zero rows today, so nothing is exposed yet — and `paige-ai-chat` writes session
-- summaries, milestones and extracted preferences into it on every turn, so it fills as soon as
-- the product is used. Closing it while it is empty is free; closing it later is a data incident.
--
-- Compare `paige_audit_log`, which looked like the same defect and was NOT: a RESTRICTIVE
-- `tenant_isolation` policy already intersected every permissive one there. This table has no
-- such policy. That difference is the whole finding, and it is why this was checked against the
-- live catalogue rather than the migration history.
--
-- §37 — WHY THIS ADDS NO COLUMN. The producer inventory is wide: nine edge functions
-- (`paige-ai-chat`, `paige-mcp`, `skill-interpreter`, `skill-runner`, `backfill-memory-embeddings`,
-- `process-data-deletion`, `factory-credit-reset`, `delete-contact`), six frontend surfaces
-- (`FieldIngestionTab`, `ClientMemoryTab`, `ContactDetail`, `ClientJourney`,
-- `useClientChatContext`, `lib/clientMemory`), and MCP tools. A new NOT NULL `tenant_id` breaks
-- every one of them at once, and several belong to surfaces this project does not own.
--
-- It is not needed. The tenant is already DERIVABLE and always was: `client_id` references
-- `clients`, which carries `tenant_id`. Deriving it closes the leak with ZERO producer changes —
-- no writer learns a new field, no contract moves, nothing half-hardened.
--
-- THE NULL BRANCH IS THE PART THAT MATTERS. `client_id` is set only when a client is in focus, so
-- an owner's own rows carry `client_user_id` and a NULL `client_id`. Admitting `client_id IS NULL`
-- unconditionally would hand every such row to every admin — which is exactly the hole found in
-- `paige_audit_log` an hour earlier, rebuilt here by accident. Those rows scope through the
-- SUBJECT's tenant membership instead.
--
-- RESTRICTIVE, deliberately: it INTERSECTS the existing permissive policies rather than replacing
-- them. Every current grant keeps its shape and simply cannot reach outside the caller's tenant.
-- The permissive policies are left exactly as they are; this is a fence around them, not a rewrite
-- of access rules belonging to surfaces this project does not own (§58).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON public.client_memory;
CREATE POLICY tenant_isolation ON public.client_memory
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_operator()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_memory.client_id
        AND c.tenant_id = public.current_user_tenant_id()
    )
    OR (
      client_memory.client_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = client_memory.client_user_id
          AND tm.tenant_id = public.current_user_tenant_id()
      )
    )
    -- A person can always reach their own memory, even before any tenant membership resolves.
    OR client_memory.client_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_platform_operator()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_memory.client_id
        AND c.tenant_id = public.current_user_tenant_id()
    )
    OR (
      client_memory.client_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = client_memory.client_user_id
          AND tm.tenant_id = public.current_user_tenant_id()
      )
    )
    OR client_memory.client_user_id = auth.uid()
  );

-- The join is on `client_id` and `client_user_id` for every row read, so both want an index.
CREATE INDEX IF NOT EXISTS idx_client_memory_client_id ON public.client_memory (client_id);
CREATE INDEX IF NOT EXISTS idx_client_memory_client_user_id ON public.client_memory (client_user_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- …and a memory type the code writes but the schema forbids.
--
-- `paige-ai-chat` writes `memory_type = 'user_preference'` at two sites — the real-time signal
-- scan and the end-of-session extraction — and the CHECK constraint does not list it. Driven:
--
--     ERROR:  23514 new row for relation "client_memory" violates check constraint
--             "client_memory_memory_type_check"
--
-- with a control in the same transaction proving `session_summary` IS accepted, so the table is
-- writable and the test discriminates. Every preference Paige has ever detected — "keep it
-- brief", "be direct" — was rejected on the way in. The whole point of that path is that the NEXT
-- turn honours the preference, and it never could.
--
-- The constraint is kept rather than dropped. An open vocabulary would accept a typo'd type
-- silently, and a memory nobody can retrieve because its type is misspelled is the same class of
-- invisible failure as the one above. `user_preference` is added because the code writes it.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_memory DROP CONSTRAINT IF EXISTS client_memory_memory_type_check;
ALTER TABLE public.client_memory ADD CONSTRAINT client_memory_memory_type_check
  CHECK (memory_type = ANY (ARRAY[
    -- Coaching-generic, and what the chat actually writes.
    'session_summary', 'milestone_completed', 'user_preference', 'coach_note',
    -- Pre-existing vertical types, kept so the opt-in funding path keeps working (§58). They are
    -- a schema vocabulary, not copy shipped to a tenant, so they are not a §2 default — but a
    -- coaching-generic tenant should never see one, and none of the four above is vertical.
    'report_upload', 'dispute_generated', 'funding_secured', 'lender_researched'
  ]::text[]));
