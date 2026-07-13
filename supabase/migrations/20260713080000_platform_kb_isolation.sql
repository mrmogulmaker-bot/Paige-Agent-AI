-- §9 isolation fix (final wiring audit BLOCKER) — the platform RAG canon must be
-- writable ONLY by the platform operator, never by every tenant admin.
--
-- THE LEAK: `rag_documents` is the GLOBAL platform knowledge canon (no tenant_id
-- partition) whose published rows feed EVERY tenant's Paige retrieval. Its
-- INSERT/UPDATE/DELETE policies — and the "read all" policy — were keyed on the
-- GLOBAL `admin` app_role via has_role(auth.uid(),'admin'). But every tenant
-- owner/admin holds that same global `admin` role (that is how the /admin console
-- renders for them), so ANY tenant admin could insert poisoned docs into the
-- shared canon, or edit/delete platform canon that is then served to every other
-- tenant's Paige. That is a cross-tenant §9 write leak (and a §13 integrity hole).
-- The table is empty today (0 rows), so nothing has leaked yet — this closes the
-- boundary before it is populated.
--
-- THE FIX: scope the canon's write policies AND the "read all" (incl. unpublished
-- drafts) policy to is_platform_owner() — the operator tier (= is_super_admin()).
-- The separate "Authenticated read published RAG docs" policy is LEFT INTACT: that
-- is the retrieval read path (published canon readable by every tenant's Paige),
-- which is exactly what a shared platform canon is for. Only operator authorship
-- and draft visibility are locked down.
--
-- Paired in the same audit pass with the frontend route gates on
-- /admin/knowledge-base, /admin/network-kb, /admin/knowledge (AdminOnly →
-- PlatformStaffOnly) — defense in depth. RLS is the real wall (a tenant admin
-- could call the REST API directly), the route gate keeps the operator surface
-- out of a tenant session.

-- Operator-only authorship (INSERT).
DROP POLICY IF EXISTS "Admins can insert RAG docs" ON public.rag_documents;
CREATE POLICY "Platform owner can insert RAG docs"
  ON public.rag_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_owner());

-- Operator-only edits (UPDATE).
DROP POLICY IF EXISTS "Admins can update RAG docs" ON public.rag_documents;
CREATE POLICY "Platform owner can update RAG docs"
  ON public.rag_documents FOR UPDATE TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

-- Operator-only deletes (DELETE).
DROP POLICY IF EXISTS "Admins can delete RAG docs" ON public.rag_documents;
CREATE POLICY "Platform owner can delete RAG docs"
  ON public.rag_documents FOR DELETE TO authenticated
  USING (public.is_platform_owner());

-- Operator-only read of ALL docs (incl. unpublished drafts). Published-doc
-- retrieval for every tenant stays served by the untouched
-- "Authenticated read published RAG docs" policy.
DROP POLICY IF EXISTS "Admins can read all RAG docs" ON public.rag_documents;
CREATE POLICY "Platform owner can read all RAG docs"
  ON public.rag_documents FOR SELECT TO authenticated
  USING (public.is_platform_owner());
