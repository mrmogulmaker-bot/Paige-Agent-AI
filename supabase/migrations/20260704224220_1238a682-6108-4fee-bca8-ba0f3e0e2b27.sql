-- Task #19 Phase 3.1: coach-Paige write-back tools (create_task, add_client_note).
-- Adds paige_chat_turns.tool_calls, extends paige_chat_turn_append with p_tool_calls,
-- creates two SECURITY DEFINER tool RPCs. Reuses paige_audit_log as-is.

-- ── §208 pre-flight ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='paige_chat_turns'
             AND column_name='tool_calls')
  THEN RAISE EXCEPTION 'PREFLIGHT: paige_chat_turns.tool_calls already exists'; END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
             AND p.proname IN ('paige_tool_create_task','paige_tool_add_client_note'))
  THEN RAISE EXCEPTION 'PREFLIGHT: paige_tool_* RPC already exists'; END IF;

  PERFORM 1 FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('tasks','client_notes','paige_audit_log','paige_chat_threads','paige_chat_turns')
    HAVING count(*)=5;
  IF NOT FOUND THEN RAISE EXCEPTION 'PREFLIGHT: expected tables missing'; END IF;
END $$;

-- ── Column ──
ALTER TABLE public.paige_chat_turns ADD COLUMN tool_calls jsonb;

-- ── Extend paige_chat_turn_append (drop old 9-arg sig, replace with 10-arg incl. p_tool_calls) ──
DROP FUNCTION IF EXISTS public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb);

CREATE OR REPLACE FUNCTION public.paige_chat_turn_append(
  p_thread_id uuid,
  p_role text,
  p_content text,
  p_surfaces_used text[],
  p_load_id uuid,
  p_model text,
  p_tokens_used int,
  p_latency_ms int,
  p_bundle_ref jsonb,
  p_tool_calls jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
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
     SET message_count = message_count + 1,
         last_message_at = now(),
         updated_at = now()
   WHERE id = p_thread_id;

  RETURN v_turn;
END;$$;

REVOKE ALL ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb,jsonb) TO authenticated, service_role;

-- ── Tool RPC: create_task ──
CREATE OR REPLACE FUNCTION public.paige_tool_create_task(
  p_thread_id uuid,
  p_contact_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_due_date timestamptz DEFAULT NULL,
  p_priority text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_tc uuid;
  v_task uuid;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'staff role required'; END IF;
  IF p_title IS NULL OR length(btrim(p_title))=0 THEN RAISE EXCEPTION 'title required'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('low','medium','high')
    THEN RAISE EXCEPTION 'invalid priority'; END IF;

  SELECT caller_user_id, contact_id INTO v_owner, v_tc
    FROM public.paige_chat_threads WHERE id = p_thread_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'thread not owned by caller'; END IF;
  IF v_tc IS DISTINCT FROM p_contact_id THEN RAISE EXCEPTION 'contact_id mismatch with thread'; END IF;

  v_title := btrim(p_title);

  INSERT INTO public.tasks (user_id, title, description, due_date, status, metadata)
  VALUES (
    v_uid,
    v_title,
    NULLIF(btrim(COALESCE(p_description,'')), ''),
    p_due_date,
    'pending'::task_status,
    jsonb_build_object(
      'contact_id', p_contact_id,
      'source', 'paige_tool_call',
      'thread_id', p_thread_id,
      'priority', COALESCE(p_priority,'medium')
    )
  )
  RETURNING id INTO v_task;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, payload)
  VALUES (
    v_uid,
    'tool_call:create_task',
    'task',
    v_task,
    jsonb_build_object(
      'thread_id', p_thread_id,
      'contact_id', p_contact_id,
      'tool_args', jsonb_build_object(
        'title', v_title,
        'description', p_description,
        'due_date', p_due_date,
        'priority', p_priority
      ),
      'tool_result', jsonb_build_object('task_id', v_task, 'ok', true)
    )
  );

  RETURN jsonb_build_object('ok', true, 'task_id', v_task, 'title', v_title);
END;$$;

REVOKE ALL ON FUNCTION public.paige_tool_create_task(uuid,uuid,text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paige_tool_create_task(uuid,uuid,text,text,timestamptz,text) TO authenticated, service_role;

-- ── Tool RPC: add_client_note ──
CREATE OR REPLACE FUNCTION public.paige_tool_add_client_note(
  p_thread_id uuid,
  p_contact_id uuid,
  p_content text,
  p_category text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_tc uuid;
  v_note uuid;
  v_body text;
  v_tags text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'staff role required'; END IF;
  IF p_content IS NULL OR length(btrim(p_content))=0 THEN RAISE EXCEPTION 'content required'; END IF;

  SELECT caller_user_id, contact_id INTO v_owner, v_tc
    FROM public.paige_chat_threads WHERE id = p_thread_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'thread not owned by caller'; END IF;
  IF v_tc IS DISTINCT FROM p_contact_id THEN RAISE EXCEPTION 'contact_id mismatch with thread'; END IF;

  v_body := btrim(p_content);
  v_tags := CASE WHEN p_category IS NOT NULL AND length(btrim(p_category)) > 0
                 THEN ARRAY[btrim(lower(p_category))]
                 ELSE ARRAY[]::text[] END;

  INSERT INTO public.client_notes (contact_id, author_user_id, body, tags)
  VALUES (p_contact_id, v_uid, v_body, v_tags)
  RETURNING id INTO v_note;

  INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, payload)
  VALUES (
    v_uid,
    'tool_call:add_client_note',
    'client_note',
    v_note,
    jsonb_build_object(
      'thread_id', p_thread_id,
      'contact_id', p_contact_id,
      'tool_args', jsonb_build_object(
        'content_preview', left(v_body, 200),
        'category', p_category
      ),
      'tool_result', jsonb_build_object('note_id', v_note, 'ok', true)
    )
  );

  RETURN jsonb_build_object('ok', true, 'note_id', v_note, 'preview', left(v_body, 200));
END;$$;

REVOKE ALL ON FUNCTION public.paige_tool_add_client_note(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paige_tool_add_client_note(uuid,uuid,text,text) TO authenticated, service_role;