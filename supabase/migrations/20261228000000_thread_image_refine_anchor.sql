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

-- §59 (Codex P2): the anchor is the reuse AUTHORITY, so it must be genuinely SERVER-OWNED — the
-- table-level `GRANT INSERT, UPDATE ... TO authenticated` + the `threads_insert_self`/`threads_update_self`
-- RLS policies otherwise let a browser set an arbitrary same-tenant content_id / future timestamp and
-- have paige-ai-chat trust it. A column-level REVOKE cannot express this (a table-level grant permits
-- every column regardless of a column REVOKE), so a trigger over the FULL client write surface
-- (BEFORE INSERT OR UPDATE) enforces server-ownership. It is deliberately comprehensive across every
-- client write vector — an UPDATE that sets/redirects the id, an UPDATE that bumps ONLY the timestamp
-- while the id stays non-null, AND an INSERT that smuggles a non-null anchor onto a brand-new thread —
-- because covering only UPDATE (or only an id CHANGE) leaves a forge path open (each was a separate
-- Codex round). A transition TO NULL is never frozen, so the FK ON DELETE SET NULL cascade and any
-- client-initiated clear still succeed — only a client-supplied NON-NULL authority is rejected.
-- INVOKER (never DEFINER): current_user must reflect the CONNECTED role (authenticated vs service_role),
-- which a SECURITY DEFINER body would mask.
CREATE OR REPLACE FUNCTION public.paige_chat_threads_freeze_image_anchor()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- Trusted server roles (paige-ai-chat's service-role client; migrations/data-fixes as owner) write
  -- the anchor freely.
  IF current_user IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- A client-created thread NEVER legitimately carries an anchor (the service-role writer only sets it
    -- AFTER a generation, via UPDATE). Force both columns to NULL so a forged non-null anchor cannot be
    -- smuggled in on INSERT — the write vector a BEFORE UPDATE trigger alone missed (Codex P2).
    NEW.last_image_content_id := NULL;
    NEW.last_image_anchor_at  := NULL;
  ELSIF NEW.last_image_content_id IS NOT NULL THEN
    -- UPDATE: freeze WHENEVER the row would retain a non-null id — this reverts BOTH an id forge/redirect
    -- AND a TIMESTAMP-ONLY bump that would push last_image_anchor_at into the future to keep an old image
    -- eligible past its recency window (Codex P2). The client's other thread-row edits (e.g. summary) are
    -- untouched; a transition TO NULL stays allowed (FK cascade, expiry/failure clear).
    NEW.last_image_content_id := OLD.last_image_content_id;
    NEW.last_image_anchor_at  := OLD.last_image_anchor_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paige_chat_threads_freeze_image_anchor ON public.paige_chat_threads;
CREATE TRIGGER trg_paige_chat_threads_freeze_image_anchor
  BEFORE INSERT OR UPDATE ON public.paige_chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.paige_chat_threads_freeze_image_anchor();

COMMENT ON COLUMN public.paige_chat_threads.last_image_content_id IS
  'Task #15: in-place-image-refine anchor — the immediately-eligible Paige-created marketing_content image id for THIS (tenant, thread). SERVER-OWNED: the trg_paige_chat_threads_freeze_image_anchor BEFORE UPDATE trigger rejects any non-service-role attempt to SET a non-null value here, so only paige-ai-chat''s service-role writer (after a successful generate_image with a filed content_id) can set it — a browser cannot forge it. Reuse is doubly fenced by save_marketing_content (`WHERE id=p_id AND tenant_id=_tenant`): a foreign-tenant id → CONTENT_NOT_FOUND → fresh insert (no cross-tenant read/write). Clearing to NULL is always allowed (FK ON DELETE SET NULL auto-clears a deleted image; the writer clears on failed generation/expiry).';
COMMENT ON COLUMN public.paige_chat_threads.last_image_anchor_at IS
  'Task #15: when last_image_content_id was set — bounds refine eligibility to a recency window (expiry clear).';
