-- Your Paige — multi-chat persistence + rolling-summary recall (#94).
--
-- Reuses the existing paige_chat_threads / paige_chat_turns tables, their RLS,
-- and the paige_chat_thread_create / paige_chat_turn_append RPCs. Adds only:
-- a monotonic turn ordinal, a rolling-summary watermark, an owner-sidebar index,
-- a sliding retention window, and a privacy tightening so personal owner chats
-- (contact_id IS NULL) are owner-only while tenant-admin oversight stays scoped
-- to contact-scoped client threads.
--
-- Your Paige == lens = 'coach' AND contact_id IS NULL. ('owner' is not a valid
-- lens — the CHECK admits only 'coach'/'client'/'platform'.) The single-active
-- UNIQUE(caller_user_id, contact_id, lens) WHERE is_archived=false index is left
-- untouched: multi-chat depends on Postgres NULLS-DISTINCT treating each NULL
-- contact_id as a distinct row.

-- 1. Monotonic per-turn ordinal — deterministic ordering for display + recall.
--    bigserial backfills existing rows and auto-fills new ones; the append RPC
--    needs no change (it never references seq).
ALTER TABLE public.paige_chat_turns ADD COLUMN IF NOT EXISTS seq bigserial;
CREATE INDEX IF NOT EXISTS idx_paige_chat_turns_thread_seq
  ON public.paige_chat_turns (thread_id, seq);

-- 2. Rolling-summary watermark: the summary covers turns with seq <= this value.
--    Keeps the summarized range and the verbatim tail from ever overlapping.
ALTER TABLE public.paige_chat_threads
  ADD COLUMN IF NOT EXISTS summary_through_seq bigint NOT NULL DEFAULT 0;

-- 3. Owner sidebar index — the "Your Paige" thread list is owner-scoped,
--    lens='coach', contact_id IS NULL, newest first.
CREATE INDEX IF NOT EXISTS idx_paige_chat_threads_owner_list
  ON public.paige_chat_threads (caller_user_id, last_message_at DESC)
  WHERE contact_id IS NULL AND lens = 'coach' AND is_archived = false;

-- 4. Sliding retention: refresh auto_delete_at on every append so an actively
--    used thread is never reaped 90 days after CREATION. Adds p_tool_calls as a
--    trailing optional arg (kept in sync with the tool_calls column) and the
--    auto_delete_at SET line — the rest mirrors the shipped body.
CREATE OR REPLACE FUNCTION public.paige_chat_turn_append(
  p_thread_id uuid, p_role text, p_content text, p_surfaces_used text[],
  p_load_id uuid, p_model text, p_tokens_used int, p_latency_ms int,
  p_bundle_ref jsonb, p_tool_calls jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_turn uuid;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_role NOT IN ('user','assistant','system') THEN RAISE EXCEPTION 'invalid role'; END IF;

  SELECT caller_user_id INTO v_owner FROM public.paige_chat_threads WHERE id = p_thread_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'thread not owned by caller'; END IF;

  INSERT INTO public.paige_chat_turns
    (thread_id, role, content, surfaces_used, load_id, model,
     tokens_used, latency_ms, bundle_ref, tool_calls)
  VALUES
    (p_thread_id, p_role, p_content, p_surfaces_used, p_load_id, p_model,
     p_tokens_used, p_latency_ms, p_bundle_ref, p_tool_calls)
  RETURNING id INTO v_turn;

  UPDATE public.paige_chat_threads
     SET message_count   = message_count + 1,
         last_message_at = now(),
         auto_delete_at  = now() + interval '90 days',   -- sliding window
         updated_at      = now()
   WHERE id = p_thread_id;

  RETURN v_turn;
END;
$$;

-- 5. Privacy: personal owner chats (contact_id IS NULL) are owner-only.
--    Tenant-admin oversight applies ONLY to contact-scoped client threads.
--    Platform owner retained for §9 support access.
DROP POLICY IF EXISTS "threads_select_owner_or_admin" ON public.paige_chat_threads;
CREATE POLICY "threads_select_owner_or_admin"
  ON public.paige_chat_threads FOR SELECT TO authenticated
  USING (
    caller_user_id = auth.uid()
    OR public.is_platform_owner()
    OR (contact_id IS NOT NULL
        AND tenant_id = public.current_user_tenant_id()
        AND public.is_tenant_admin(tenant_id))
  );

DROP POLICY IF EXISTS "turns_select_via_thread" ON public.paige_chat_turns;
CREATE POLICY "turns_select_via_thread"
  ON public.paige_chat_turns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.paige_chat_threads t
    WHERE t.id = paige_chat_turns.thread_id
      AND ( t.caller_user_id = auth.uid()
         OR public.is_platform_owner()
         OR (t.contact_id IS NOT NULL
             AND t.tenant_id = public.current_user_tenant_id()
             AND public.is_tenant_admin(t.tenant_id)) )
  ));

-- NOTE: idx_paige_chat_threads_single_active is intentionally left untouched —
-- multi-chat relies on its NULL-distinct behavior for contact_id IS NULL rows.
