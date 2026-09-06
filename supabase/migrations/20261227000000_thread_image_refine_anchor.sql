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
-- table-level `GRANT UPDATE ... TO authenticated` + the `threads_update_self` RLS policy otherwise
-- let a browser set an arbitrary same-tenant content_id / future timestamp and have paige-ai-chat
-- trust it. A column-level REVOKE cannot express this (a table-level UPDATE grant permits every
-- column regardless of a column REVOKE), so a BEFORE UPDATE trigger freezes CLIENT attempts to SET a
-- non-null anchor. It deliberately does NOT touch a transition TO NULL, so the FK ON DELETE SET NULL
-- cascade and any client-initiated clear still succeed — only forging a non-null authority is blocked.
-- INVOKER (never DEFINER): current_user must reflect the CONNECTED role (authenticated vs service_role),
-- which a SECURITY DEFINER body would mask.
CREATE OR REPLACE FUNCTION public.paige_chat_threads_freeze_image_anchor()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- Trusted server roles (paige-ai-chat's service-role client; migrations/data-fixes as owner) write
  -- the anchor freely. Any other caller (a JWT client → `authenticated`) may CLEAR it but may not
  -- forge a non-null authority: a client attempt to set/change last_image_content_id to a non-null
  -- value is reverted to the prior server-set values, leaving its other thread-row edits intact.
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres')
     AND NEW.last_image_content_id IS NOT NULL
     AND NEW.last_image_content_id IS DISTINCT FROM OLD.last_image_content_id THEN
    NEW.last_image_content_id := OLD.last_image_content_id;
    NEW.last_image_anchor_at  := OLD.last_image_anchor_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_paige_chat_threads_freeze_image_anchor ON public.paige_chat_threads;
CREATE TRIGGER trg_paige_chat_threads_freeze_image_anchor
  BEFORE UPDATE ON public.paige_chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.paige_chat_threads_freeze_image_anchor();

COMMENT ON COLUMN public.paige_chat_threads.last_image_content_id IS
  'Task #15: in-place-image-refine anchor — the immediately-eligible Paige-created marketing_content image id for THIS (tenant, thread). SERVER-OWNED: the trg_paige_chat_threads_freeze_image_anchor BEFORE UPDATE trigger rejects any non-service-role attempt to SET a non-null value here, so only paige-ai-chat''s service-role writer (after a successful generate_image with a filed content_id) can set it — a browser cannot forge it. Reuse is doubly fenced by save_marketing_content (`WHERE id=p_id AND tenant_id=_tenant`): a foreign-tenant id → CONTENT_NOT_FOUND → fresh insert (no cross-tenant read/write). Clearing to NULL is always allowed (FK ON DELETE SET NULL auto-clears a deleted image; the writer clears on failed generation/expiry).';
COMMENT ON COLUMN public.paige_chat_threads.last_image_anchor_at IS
  'Task #15: when last_image_content_id was set — bounds refine eligibility to a recency window (expiry clear).';
