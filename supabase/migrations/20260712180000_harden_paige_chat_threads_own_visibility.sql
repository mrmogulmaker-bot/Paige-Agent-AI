-- Task #149 — a user must ALWAYS be able to see and manage their own Paige chat
-- threads, even if their active tenant diverges from the thread's tenant_id.
--
-- The RESTRICTIVE `threads_tenant_isolation` policy AND-s with the permissive
-- ones, so a thread whose creator's active_tenant_id no longer equals the
-- thread's tenant_id (tenant switch, or a null active_tenant) passed the
-- permissive `caller_user_id = auth.uid()` SELECT but FAILED the restrictive
-- `tenant_id = current_user_tenant_id()` — silently hiding the user's OWN chats.
-- (Latent today: 0 divergent rows in prod, but it fires the instant a user's
-- active tenant changes or goes null.)
--
-- Fix: add a strictly self-scoped escape (`caller_user_id = auth.uid()`) to the
-- restrictive wall. This only ever grants a user access to rows THEY created —
-- never another user's — so cross-tenant isolation of everyone else's threads is
-- fully preserved (a user in tenant A still cannot see/update a thread they don't
-- own in tenant B: not owner, tenant mismatch, not platform owner). The admin
-- client-thread view branch is unaffected: it still self-limits to the admin's
-- own tenant via the permissive policy.
--
-- Verified with rolled-back SET-LOCAL-ROLE-authenticated RLS proofs:
--   read:  own divergent-tenant thread visible = 1, foreign thread visible = 0
--   write: rename own divergent thread = 1 row, hijack foreign thread = 0 rows

DROP POLICY IF EXISTS threads_tenant_isolation ON public.paige_chat_threads;
CREATE POLICY threads_tenant_isolation ON public.paige_chat_threads
  AS RESTRICTIVE
  FOR ALL
  USING (
    is_platform_owner()
    OR tenant_id = current_user_tenant_id()
    OR caller_user_id = auth.uid()
  )
  WITH CHECK (
    is_platform_owner()
    OR tenant_id = current_user_tenant_id()
    OR caller_user_id = auth.uid()
  );
