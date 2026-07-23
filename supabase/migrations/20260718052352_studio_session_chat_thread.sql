-- Studio session chat (#292) — bind a Paige chat thread to a Vibe Studio project session so the
-- session's chat box is a real, persistent two-way conversation driven by a creative-design
-- sub-agent (one of Paige's team), NOT a second chat system (§18). This REUSES the existing
-- paige_chat_threads / paige_chat_turns engine + RPCs; it only adds a session pointer, a
-- collision-safe index split, and a get-or-create RPC.
--
-- BLAST-RADIUS NOTE (shared table): paige_chat_threads also backs the live "Your Paige" chat. This
-- migration is additive and backward-compatible: the new column defaults NULL on every existing
-- row, so the recreated single-active index below covers EXACTLY the same rows it does today (all
-- have studio_session_id IS NULL) — the "one active Your-Paige thread" guarantee is unchanged.

-- 1) The session pointer. NULL = a normal (Your-Paige / contact) thread, unchanged. Non-NULL = a
--    thread that lives inside one Vibe Studio project session. CASCADE: deleting the project drops
--    its chat with it.
ALTER TABLE public.paige_chat_threads
  ADD COLUMN IF NOT EXISTS studio_session_id uuid REFERENCES public.studio_sessions(id) ON DELETE CASCADE;

-- 2) Split the single-active uniqueness so a studio thread never collides with the owner's
--    Your-Paige thread (same caller, 'coach' lens, NULL contact). Postgres treats NULLs as DISTINCT
--    in unique indexes, so we CANNOT just append studio_session_id to the old index (two NULL-session
--    Your-Paige threads would stop colliding). Instead: keep the original guarantee for non-studio
--    threads, and add a separate one-active-thread-per-(caller, session) guarantee for studio threads.
DROP INDEX IF EXISTS public.idx_paige_chat_threads_single_active;
CREATE UNIQUE INDEX idx_paige_chat_threads_single_active
  ON public.paige_chat_threads (caller_user_id, contact_id, lens)
  WHERE is_archived = false AND studio_session_id IS NULL;

CREATE UNIQUE INDEX idx_paige_chat_threads_studio_single
  ON public.paige_chat_threads (caller_user_id, studio_session_id)
  WHERE is_archived = false AND studio_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paige_chat_threads_studio_session
  ON public.paige_chat_threads (studio_session_id)
  WHERE studio_session_id IS NOT NULL;

-- 3) Get-or-create the caller's active chat thread for a studio session. Mirrors
--    paige_chat_thread_create's auth shape, but is idempotent (returns the existing active thread if
--    one exists) and pins the tenant from the SESSION row (§9 — the session's tenant, verified to be
--    the caller's, never a caller-supplied tenant). lens='coach' (owner-side studio); contact_id NULL.
CREATE OR REPLACE FUNCTION public.paige_studio_thread_ensure(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_tenant    uuid;
  v_owner     uuid;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'STUDIO_THREAD_AUTH: auth required' USING ERRCODE = '42501'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'STUDIO_THREAD_NO_SESSION: a session id is required' USING ERRCODE = '22023'; END IF;

  SELECT tenant_id, owner_user_id INTO v_tenant, v_owner
    FROM public.studio_sessions WHERE id = p_session_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'STUDIO_THREAD_SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- §9: only a member of the session's tenant (or the platform owner) may open its chat. The single
  -- active-thread index is per-caller, so each staff member gets their OWN thread on a shared session.
  IF NOT public.is_platform_owner()
     AND NOT (v_tenant = public.current_user_tenant_id() AND public.is_tenant_member(v_tenant)) THEN
    RAISE EXCEPTION 'STUDIO_THREAD_FORBIDDEN: session not in your workspace' USING ERRCODE = '42501';
  END IF;

  -- Reuse the caller's existing active thread for this session, if any (idempotent).
  SELECT id INTO v_thread_id
    FROM public.paige_chat_threads
   WHERE caller_user_id = v_uid
     AND studio_session_id = p_session_id
     AND is_archived = false
   LIMIT 1;
  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO public.paige_chat_threads
    (caller_user_id, contact_id, tenant_id, lens, title,
     studio_session_id, auto_delete_at, last_message_at)
  VALUES
    (v_uid, NULL, v_tenant, 'coach', 'Studio session',
     p_session_id, now() + interval '90 days', now())
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.paige_studio_thread_ensure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paige_studio_thread_ensure(uuid) TO authenticated, service_role;
