-- Task #15 — Dedicated Paige chat in-place image refinement: the SERVER-OWNED refine anchor.
--
-- The Vibe Studio refines an image in place by reusing its marketing_content row, clamped to the
-- FRONTEND-supplied `canvasArtifact` that only the Studio composer sends. The dedicated Paige chat
-- sends no canvasArtifact, so every refine there mints a NEW sibling row. This adds a server-owned
-- anchor so the dedicated chat can refine the immediately-eligible Paige image IN PLACE.
--
-- Owner constraints (2026-09-06), satisfied structurally by putting the anchor on the thread row:
--   * tied to (active tenant + active conversation/thread + immediately-eligible Paige image);
--   * NEVER an arbitrary client/model-supplied content_id as authority — paige-ai-chat only ever
--     writes an id it just created server-side for THIS (tenant, thread), and the reuse UPDATE is
--     itself tenant-scoped (save_marketing_content: WHERE id = p_id AND tenant_id = _tenant);
--   * cleared on workspace switch + conversation switch → the anchor LIVES ON the thread row, which
--     `paige_chat_threads` RLS already double-scopes to (caller_user_id = auth.uid()) AND the
--     RESTRICTIVE (tenant_id = current_user_tenant_id()), so a different tenant/thread is a
--     different (or absent) anchor by construction;
--   * cleared on failed generation / cancellation → the writer only sets it on a genuine success
--     with a filed content_id, so a failure never writes it;
--   * cleared on expiry → the reader bounds eligibility to a recency window using anchor_at;
--   * cleared when the referenced image is deleted → the FK below is ON DELETE SET NULL.
--
-- §18/§12: extend the existing thread row (one home), not a new table. §9: no new RLS surface — the
-- anchor inherits the thread's proven ownership + tenant isolation. §59: no new SECURITY DEFINER fn.

ALTER TABLE public.paige_chat_threads
  ADD COLUMN IF NOT EXISTS last_image_content_id uuid
    REFERENCES public.marketing_content(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_image_anchor_at timestamptz;

-- Index the REFERENCING column: ON DELETE SET NULL makes Postgres scan paige_chat_threads (a
-- high-traffic table) for every marketing_content delete — and deletes are reachable in prod
-- (delete_marketing_content is authenticated-callable; tenant offboarding cascade-deletes images).
-- Partial (only the few threads that carry an anchor) keeps the index tiny, so a plain build fits
-- the `supabase db push` transaction.
CREATE INDEX IF NOT EXISTS idx_paige_chat_threads_last_image_content_id
  ON public.paige_chat_threads (last_image_content_id)
  WHERE last_image_content_id IS NOT NULL;

COMMENT ON COLUMN public.paige_chat_threads.last_image_content_id IS
  'Task #15: in-place-image-refine anchor — the immediately-eligible Paige-created marketing_content image id for THIS (tenant, thread). paige-ai-chat WRITES it only after a successful generate_image with a filed content_id (server-writer convention, defense-in-depth). The ENFORCED safety fence is NOT this column (RLS is row-level, so a thread owner can set it) but the reuse itself: save_marketing_content reuses `WHERE id=p_id AND tenant_id=_tenant`, so a forged foreign-tenant id → CONTENT_NOT_FOUND → fresh insert (no cross-tenant read/write); a forged own-tenant id only redirects onto a row the admin/coach may already edit, and the prior image is snapshotted. ON DELETE SET NULL auto-clears a deleted image.';
COMMENT ON COLUMN public.paige_chat_threads.last_image_anchor_at IS
  'Task #15: when last_image_content_id was set — bounds refine eligibility to a recency window (expiry clear).';
