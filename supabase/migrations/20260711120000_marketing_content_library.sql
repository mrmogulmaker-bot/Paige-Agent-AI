-- Content Studio library (§10) — one tenant-scoped store for the marketing content
-- Paige (and the tenant) create: drafted copy (kind='text') and generated images
-- (kind='image'). Tenant-authored and tenant-scoped (§9), tenant-generic (§2) — no
-- vertical/finance defaults seeded here; rows are whatever the tenant asks Paige to make.
-- Every writer shares one guarded seam: the UI Save button, the generate-image function,
-- and Paige's content_save tool all land here through save_marketing_content, so Paige
-- can author and manage the library end-to-end with no human in the UI (§10).

CREATE TABLE IF NOT EXISTS public.marketing_content (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image')),
  channel     text,                       -- social_post | ad_copy | email_campaign | caption | blog_outline | sms_broadcast (text)
  title       text NOT NULL DEFAULT 'Untitled',
  body        text,                        -- the copy (text kind)
  image_url   text,                        -- public URL (image kind)
  image_path  text,                        -- storage path in paige-generated (image kind)
  size        text,                        -- square | portrait | landscape (image kind)
  brief       text,                        -- the prompt/brief that produced it
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','archived')),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_content_tenant_created_idx
  ON public.marketing_content (tenant_id, created_at DESC);

ALTER TABLE public.marketing_content ENABLE ROW LEVEL SECURITY;

-- Admins/coaches manage their own tenant's library; platform admin sees all; Paige
-- (service-role) drives it on their behalf.
DROP POLICY IF EXISTS marketing_content_tenant_manage ON public.marketing_content;
CREATE POLICY marketing_content_tenant_manage ON public.marketing_content
  FOR ALL
  USING (
    (tenant_id = public.current_user_tenant_id()
      AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','coach']))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (tenant_id = public.current_user_tenant_id()
      AND public.has_any_role(auth.uid(), ARRAY['admin','super_admin','coach']))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS marketing_content_service ON public.marketing_content;
CREATE POLICY marketing_content_service ON public.marketing_content
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_marketing_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_marketing_content ON public.marketing_content;
CREATE TRIGGER trg_touch_marketing_content BEFORE UPDATE ON public.marketing_content
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_content();

-- Save (insert or update) one content item. Dual-caller: trusted service-role for
-- Paige, admin|coach for JWT callers. Service-role bypasses RLS/stamp triggers, so the
-- tenant must be passed explicitly. Pure DB state (a saved draft), so it runs DIRECT —
-- actually sending/publishing anything remains a separate, approval-gated action (§8).
CREATE OR REPLACE FUNCTION public.save_marketing_content(
  p_kind       text,
  p_title      text,
  p_body       text DEFAULT NULL,
  p_channel    text DEFAULT NULL,
  p_image_url  text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_size       text DEFAULT NULL,
  p_brief      text DEFAULT NULL,
  p_meta       jsonb DEFAULT '{}'::jsonb,
  p_id         uuid DEFAULT NULL,
  p_tenant_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _kind text := CASE WHEN p_kind IN ('text','image') THEN p_kind ELSE 'text' END;
  _id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONTENT_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.marketing_content SET
      title = COALESCE(NULLIF(btrim(p_title), ''), title),
      body = COALESCE(p_body, body),
      channel = COALESCE(p_channel, channel),
      brief = COALESCE(p_brief, brief),
      meta = COALESCE(p_meta, meta)
    WHERE id = p_id AND tenant_id = _tenant
    RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN _id;
  END IF;

  INSERT INTO public.marketing_content (
    tenant_id, created_by, kind, channel, title, body,
    image_url, image_path, size, brief, meta
  ) VALUES (
    _tenant, _caller, _kind, NULLIF(btrim(p_channel), ''),
    COALESCE(NULLIF(btrim(p_title), ''), 'Untitled'), p_body,
    NULLIF(btrim(p_image_url), ''), NULLIF(btrim(p_image_path), ''),
    NULLIF(btrim(p_size), ''), p_brief, COALESCE(p_meta, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'marketing_content', 'save_marketing_content', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', _kind, 'channel', p_channel));

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_marketing_content(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _deleted int;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONTENT_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.marketing_content
   WHERE id = p_id
     AND (_caller IS NULL OR tenant_id = _tenant OR public.has_role(_caller, 'admin'::app_role));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_marketing_content(text, text, text, text, text, text, text, text, jsonb, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_marketing_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_marketing_content(uuid) TO authenticated, service_role;
