-- Media Library (#284/#283, §7/§10/§12/§18) — the tenant's curation-of-winners store.
--
-- The Studio makes many iterations across FIVE creative types; not every one is a keeper. This
-- is the ONE place a tenant deliberately KEEPS the winners, spanning every type, across projects.
-- It is a polymorphic MEMBERSHIP table, never a content copy: a saved row points at the real
-- source row in its own store (growth_pages / growth_funnels / growth_forms for page/funnel/form,
-- marketing_content for image/copy) and carries a display snapshot (title + thumbnail) taken at
-- save time. This EXTENDS, does not fork (§18): marketing_content stays the store for image/copy
-- deliverables; growth_* stay the store for page/funnel/form; studio_library_items is the thin
-- curation layer that unifies "what did I keep" across all of them without a second content home.
--
-- Doctrine:
--   §9  — tenant-scoped + RLS; every read/write pinned to the caller's tenant. The save RPC uses
--         the SAME isolation block as save_marketing_content (a JWT caller may only target a
--         tenant they belong to; only the service-role/Paige path may pass an arbitrary tenant).
--   §10 — save_to_library / remove_from_library / list_library are callable seams, so Paige can
--         pin/unpin/list a tenant's saved work by voice, not only a human clicking in the UI.
--   §13 — the display snapshot means the library never shows a broken card if the source row is
--         later deleted (it shows the kept title as a tombstone); a link resolves the live source.
--   §2  — tenant-generic; no vertical/finance default is ever seeded here.

CREATE TABLE IF NOT EXISTS public.studio_library_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('page','funnel','form','image','copy')),
  artifact_id   uuid NOT NULL,            -- the real source row (growth_* or marketing_content)
  title         text NOT NULL DEFAULT 'Untitled',   -- display snapshot at save time
  thumbnail_url text,                      -- image/thumbnail snapshot (image kind or a page cover)
  note          text,                      -- an optional why-I-kept-this note
  tags          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- reserved for the deferred tagging UI
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_at      timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Saving the same artifact twice is idempotent — it re-keeps (refreshes the snapshot), never dupes.
  CONSTRAINT studio_library_items_unique_artifact UNIQUE (tenant_id, artifact_kind, artifact_id)
);

CREATE INDEX IF NOT EXISTS studio_library_items_tenant_saved_idx
  ON public.studio_library_items (tenant_id, saved_at DESC);

ALTER TABLE public.studio_library_items ENABLE ROW LEVEL SECURITY;

-- Same access shape as marketing_content: admins/coaches manage their own tenant's library;
-- platform admin sees all; Paige (service-role) drives it on their behalf.
DROP POLICY IF EXISTS studio_library_items_tenant_manage ON public.studio_library_items;
CREATE POLICY studio_library_items_tenant_manage ON public.studio_library_items
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

DROP POLICY IF EXISTS studio_library_items_service ON public.studio_library_items;
CREATE POLICY studio_library_items_service ON public.studio_library_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_studio_library_items()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_studio_library_items ON public.studio_library_items;
CREATE TRIGGER trg_touch_studio_library_items BEFORE UPDATE ON public.studio_library_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_studio_library_items();

-- Keep one artifact in the tenant's media library (idempotent upsert on the unique key). Dual
-- caller: trusted service-role for Paige (may pass p_tenant_id), admin|coach for JWT callers
-- (may only target a tenant they belong to — §9). Pure DB state; no send/publish here.
CREATE OR REPLACE FUNCTION public.save_to_library(
  p_kind          text,
  p_artifact_id   uuid,
  p_title         text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_note          text DEFAULT NULL,
  p_tenant_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
  _title text := NULLIF(btrim(p_title), '');   -- NULL when the caller passed no title
  _id uuid;
BEGIN
  IF p_kind NOT IN ('page','funnel','form','image','copy') THEN
    RAISE EXCEPTION 'LIBRARY_BAD_KIND: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_artifact_id IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_ARTIFACT: an artifact id is required' USING ERRCODE = '22023';
  END IF;
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'LIBRARY_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  -- §9 isolation: a JWT caller may only write into a tenant they belong to; only the trusted
  -- service-role path (Paige, _caller IS NULL) may target an arbitrary tenant.
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.has_role(_caller, 'admin'::app_role)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.studio_library_items (
    tenant_id, created_by, artifact_kind, artifact_id, title, thumbnail_url, note, saved_at
  ) VALUES (
    _tenant, _caller, p_kind, p_artifact_id,
    COALESCE(_title, 'Untitled'),
    NULLIF(btrim(p_thumbnail_url), ''), p_note, now()
  )
  -- On a re-key, use the LOCAL _title (NULL when the caller omitted one) so a title-less re-save
  -- (e.g. a Paige voice re-keep) PRESERVES the stored title instead of resetting it to 'Untitled'.
  ON CONFLICT (tenant_id, artifact_kind, artifact_id) DO UPDATE SET
    title         = COALESCE(_title, studio_library_items.title),
    thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, studio_library_items.thumbnail_url),
    note          = COALESCE(EXCLUDED.note, studio_library_items.note),
    saved_at      = now()
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (_caller, 'studio_library_items', 'save_to_library', _id,
          jsonb_build_object('tenant_id', _tenant, 'kind', p_kind, 'artifact_id', p_artifact_id));

  RETURN _id;
END;
$$;

-- Remove one kept artifact from the library (by membership id, OR by kind+artifact_id). Derives
-- the tenant from the caller (never trusts a body tenant), so it was never IDOR-able.
CREATE OR REPLACE FUNCTION public.remove_from_library(
  p_id          uuid DEFAULT NULL,
  p_kind        text DEFAULT NULL,
  p_artifact_id uuid DEFAULT NULL
)
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
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.studio_library_items
   WHERE (_caller IS NULL OR tenant_id = _tenant OR public.has_role(_caller, 'admin'::app_role))
     AND (
       (p_id IS NOT NULL AND id = p_id)
       OR (p_id IS NULL AND p_kind IS NOT NULL AND p_artifact_id IS NOT NULL
           AND artifact_kind = p_kind AND artifact_id = p_artifact_id)
     );
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted > 0;
END;
$$;

-- List the tenant's kept artifacts, newest-kept first, optionally filtered to one kind. Reads the
-- caller's own tenant (or an explicit tenant for the service-role/Paige path).
CREATE OR REPLACE FUNCTION public.list_library(
  p_kind      text DEFAULT NULL,
  p_limit     int DEFAULT 200,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, artifact_kind text, artifact_id uuid, title text,
  thumbnail_url text, note text, tags jsonb, saved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _tenant uuid := COALESCE(p_tenant_id, public.current_user_tenant_id());
BEGIN
  IF _tenant IS NULL THEN
    RETURN;
  END IF;
  -- §9: a JWT caller may only read a tenant they belong to; service-role/Paige may pass a tenant.
  -- NULL-safe membership check ONLY — matching save_to_library. A prior `_tenant <> current_user_
  -- tenant_id()` conjunct here failed OPEN for a tenant-less authenticated caller (NULL <> x is
  -- NULL, so the AND chain never RAISEd → cross-tenant read). is_tenant_member() is an EXISTS
  -- (never NULL), so this rejects a non-member — including a tenant-less user — targeting any tenant.
  IF _caller IS NOT NULL
     AND NOT public.is_tenant_member(_tenant)
     AND NOT public.has_role(_caller, 'admin'::app_role)
     AND NOT public.is_platform_owner(_caller) THEN
    RAISE EXCEPTION 'LIBRARY_FORBIDDEN: tenant not in your membership' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT li.id, li.artifact_kind, li.artifact_id, li.title,
         li.thumbnail_url, li.note, li.tags, li.saved_at
    FROM public.studio_library_items li
   WHERE li.tenant_id = _tenant
     AND (p_kind IS NULL OR li.artifact_kind = p_kind)
   ORDER BY li.saved_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
END;
$$;

REVOKE ALL ON FUNCTION public.save_to_library(text, uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_to_library(text, uuid, text, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_from_library(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_from_library(uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_library(text, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_library(text, int, uuid) TO authenticated, service_role;

-- ── Close the paige-generated bucket gap (§13) ──────────────────────────────────────────────
-- generate-image uploads to 'paige-generated' and getPublicUrl()s a link that ships onto LIVE
-- pages, but no migration ever created the bucket — it was made out-of-band, so a fresh project
-- (or the BYO path) has no such bucket and image generation would 500 with no public URL. Create
-- it here, mirroring the growth-assets pattern (public read, member-scoped writes by path prefix).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'paige-generated', 'paige-generated', true, 10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "paige_generated public read" ON storage.objects;
CREATE POLICY "paige_generated public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'paige-generated');

DROP POLICY IF EXISTS "paige_generated member upload" ON storage.objects;
CREATE POLICY "paige_generated member upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'paige-generated'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "paige_generated member update" ON storage.objects;
CREATE POLICY "paige_generated member update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'paige-generated'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "paige_generated member delete" ON storage.objects;
CREATE POLICY "paige_generated member delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'paige-generated'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );
