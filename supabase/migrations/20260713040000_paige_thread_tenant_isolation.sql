-- §9 TENANT ISOLATION FIX — Paige chat threads must never bleed across tenants.
--
-- Owner-reported seep: an agency owner switches into a sub-account (the switcher
-- sets profiles.active_tenant_id = child and upserts an active child membership,
-- so current_user_tenant_id() now returns the child) and their AGENCY "Your Paige"
-- threads render inside the child sub-account. A Paige conversation must be
-- dedicated to the tenant/sub-account it was created in and never appear anywhere
-- else.
--
-- ROOT CAUSE (two layers, both fail-OPEN on scope):
--   1. The owner-sidebar read query carried no tenant predicate (fixed in
--      src/hooks/usePaigeThreads.ts — now filters tenant_id = active tenant).
--   2. RLS was deliberately loosened to be OWNER-scoped, not TENANT-scoped:
--        • 20260711300000 permissive SELECT `threads_select_owner_or_admin` made
--          `caller_user_id = auth.uid()` an unconditional first branch — a user's
--          own thread was selectable regardless of active tenant.
--        • 20260712180000 (Task #149) added `OR caller_user_id = auth.uid()` to the
--          RESTRICTIVE `threads_tenant_isolation` wall — punching a hole straight
--          through tenant isolation for the caller's own rows.
--      Task #149's goal ("always see your own threads even when active tenant
--      diverges from the thread's tenant") IS the §9 violation: for an agency owner
--      who owns threads in both parent and child, "always visible" = the seep.
--
-- FIX (fail-CLOSED, defense-in-depth, reuses the existing current_user_tenant_id()
-- active-tenant resolver — no fork):
--   • Restore the RESTRICTIVE tenant wall to tenant-only (drop the caller_user_id
--     escape). Every row read/written must belong to the caller's ACTIVE tenant
--     (platform-owner retains §9 support access).
--   • Re-scope the permissive SELECT so the owner/admin branches are gated by
--     tenant_id = current_user_tenant_id() — belt-and-suspenders with the wall.
--   • Re-scope the turns SELECT the same way so message bodies can't leak even if a
--     policy subquery were evaluated without the parent wall.
--   With this, when active_tenant flips to a child, the owner's agency threads are
--   invisible in the child (and vice-versa); switching back re-scopes them in.
--
-- NULL / fail-closed: tenant_id is NOT NULL (since the table's creation) and is
-- stamped at insert time by paige_chat_thread_create from current_user_tenant_id(),
-- so there are NO legacy rows to backfill. If current_user_tenant_id() ever returns
-- NULL (no active membership), `tenant_id = NULL` evaluates to NULL → row NOT
-- visible → no threads, never all. Likewise a hypothetical NULL tenant_id row would
-- be invisible. Scope is fail-closed by construction.
--
-- Single-tenant users are unaffected: their thread.tenant_id always equals their one
-- active tenant, so every branch that matched before still matches.

-- 1. RESTRICTIVE tenant wall — back to tenant-only (revert Task #149's own-row hole).
--    AND-s with every permissive policy; this is the hard §9 fence.
DROP POLICY IF EXISTS threads_tenant_isolation ON public.paige_chat_threads;
CREATE POLICY threads_tenant_isolation ON public.paige_chat_threads
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id = public.current_user_tenant_id()
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id = public.current_user_tenant_id()
  );

-- 2. Permissive SELECT — owner self-chats AND tenant-admin oversight are both scoped
--    to the ACTIVE tenant. Personal owner chats (contact_id IS NULL) stay owner-only;
--    admin oversight stays limited to contact-scoped client threads in-tenant.
DROP POLICY IF EXISTS "threads_select_owner_or_admin" ON public.paige_chat_threads;
CREATE POLICY "threads_select_owner_or_admin"
  ON public.paige_chat_threads FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND (
        caller_user_id = auth.uid()
        OR (contact_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
      )
    )
  );

-- 3. Turns SELECT — mirror the thread scoping inside the EXISTS so message bodies are
--    tenant-scoped independently: a turn is visible only when its parent thread is in
--    the active tenant AND the caller owns it (or is an in-tenant admin of a client
--    thread), or the caller is the platform owner.
DROP POLICY IF EXISTS "turns_select_via_thread" ON public.paige_chat_turns;
CREATE POLICY "turns_select_via_thread"
  ON public.paige_chat_turns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.paige_chat_threads t
    WHERE t.id = paige_chat_turns.thread_id
      AND (
        public.is_platform_owner()
        OR (
          t.tenant_id = public.current_user_tenant_id()
          AND (
            t.caller_user_id = auth.uid()
            OR (t.contact_id IS NOT NULL AND public.is_tenant_admin(t.tenant_id))
          )
        )
      )
  ));

-- NOTE: creation (paige_chat_thread_create) already stamps tenant_id from
-- current_user_tenant_id() and the column is NOT NULL, so no backfill is required.
-- The single-active NULLS-DISTINCT index and retention indexes are untouched.
