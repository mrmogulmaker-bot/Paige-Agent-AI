
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='paige_chat_threads') THEN
    RAISE EXCEPTION 'S208: paige_chat_threads already exists — abort';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='paige_chat_turns') THEN
    RAISE EXCEPTION 'S208: paige_chat_turns already exists — abort';
  END IF;
END $$;

CREATE TABLE public.paige_chat_threads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  contact_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  lens              text NOT NULL CHECK (lens IN ('coach','client','platform')),
  title             text,
  message_count     int  NOT NULL DEFAULT 0,
  summary           text,
  consent_snapshot  jsonb,
  is_archived       boolean NOT NULL DEFAULT false,
  auto_delete_at    timestamptz,
  last_message_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_chat_threads TO authenticated;
GRANT ALL ON public.paige_chat_threads TO service_role;

ALTER TABLE public.paige_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "threads_select_owner_or_admin"
  ON public.paige_chat_threads FOR SELECT TO authenticated
  USING (
    caller_user_id = auth.uid()
    OR public.is_platform_owner()
    OR (tenant_id = public.current_user_tenant_id() AND public.is_tenant_admin(tenant_id))
  );

CREATE POLICY "threads_insert_self"
  ON public.paige_chat_threads FOR INSERT TO authenticated
  WITH CHECK (caller_user_id = auth.uid());

CREATE POLICY "threads_update_self"
  ON public.paige_chat_threads FOR UPDATE TO authenticated
  USING (caller_user_id = auth.uid())
  WITH CHECK (caller_user_id = auth.uid());

CREATE POLICY "threads_delete_owner_or_platform"
  ON public.paige_chat_threads FOR DELETE TO authenticated
  USING (caller_user_id = auth.uid() OR public.is_platform_owner());

CREATE POLICY "threads_tenant_isolation"
  ON public.paige_chat_threads
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

CREATE UNIQUE INDEX idx_paige_chat_threads_single_active
  ON public.paige_chat_threads (caller_user_id, contact_id, lens)
  WHERE is_archived = false;
CREATE INDEX idx_paige_chat_threads_tenant_recent
  ON public.paige_chat_threads (tenant_id, last_message_at DESC);
CREATE INDEX idx_paige_chat_threads_retention
  ON public.paige_chat_threads (auto_delete_at)
  WHERE is_archived = false;

CREATE TRIGGER trg_paige_chat_threads_updated_at
  BEFORE UPDATE ON public.paige_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.paige_chat_turns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     uuid NOT NULL REFERENCES public.paige_chat_threads(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user','assistant','system')),
  content       text NOT NULL,
  surfaces_used text[],
  load_id       uuid,
  bundle_ref    jsonb,
  model         text,
  tokens_used   int,
  latency_ms    int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_chat_turns TO authenticated;
GRANT ALL   ON public.paige_chat_turns TO service_role;

ALTER TABLE public.paige_chat_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "turns_select_via_thread"
  ON public.paige_chat_turns FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.paige_chat_threads t
      WHERE t.id = paige_chat_turns.thread_id
        AND (
          t.caller_user_id = auth.uid()
          OR public.is_platform_owner()
          OR (t.tenant_id = public.current_user_tenant_id() AND public.is_tenant_admin(t.tenant_id))
        )
    )
  );

CREATE INDEX idx_paige_chat_turns_thread_time
  ON public.paige_chat_turns (thread_id, created_at);

CREATE OR REPLACE FUNCTION public.paige_chat_thread_create(
  p_contact_id       uuid,
  p_lens             text,
  p_title            text,
  p_consent_snapshot jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_tenant_id uuid;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_lens NOT IN ('coach','client','platform') THEN RAISE EXCEPTION 'invalid lens'; END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
      FROM public.clients WHERE id = p_contact_id;
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'contact not found or has no tenant';
    END IF;
  ELSE
    v_tenant_id := public.current_user_tenant_id();
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'self-mode requires caller tenant';
    END IF;
  END IF;

  INSERT INTO public.paige_chat_threads
    (caller_user_id, contact_id, tenant_id, lens, title,
     consent_snapshot, auto_delete_at, last_message_at)
  VALUES
    (v_uid, p_contact_id, v_tenant_id, p_lens, p_title,
     p_consent_snapshot, now() + interval '90 days', now())
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.paige_chat_turn_append(
  p_thread_id     uuid,
  p_role          text,
  p_content       text,
  p_surfaces_used text[],
  p_load_id       uuid,
  p_model         text,
  p_tokens_used   int,
  p_latency_ms    int,
  p_bundle_ref    jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_turn   uuid;
  v_owner  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_role NOT IN ('user','assistant','system') THEN RAISE EXCEPTION 'invalid role'; END IF;

  SELECT caller_user_id INTO v_owner
    FROM public.paige_chat_threads WHERE id = p_thread_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'thread not owned by caller'; END IF;

  INSERT INTO public.paige_chat_turns
    (thread_id, role, content, surfaces_used, load_id, model,
     tokens_used, latency_ms, bundle_ref)
  VALUES
    (p_thread_id, p_role, p_content, p_surfaces_used, p_load_id, p_model,
     p_tokens_used, p_latency_ms, p_bundle_ref)
  RETURNING id INTO v_turn;

  UPDATE public.paige_chat_threads
     SET message_count   = message_count + 1,
         last_message_at = now(),
         updated_at      = now()
   WHERE id = p_thread_id;

  RETURN v_turn;
END;
$$;

REVOKE ALL ON FUNCTION public.paige_chat_thread_create(uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paige_chat_thread_create(uuid,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.paige_chat_turn_append(uuid,text,text,text[],uuid,text,int,int,jsonb) TO authenticated, service_role;
