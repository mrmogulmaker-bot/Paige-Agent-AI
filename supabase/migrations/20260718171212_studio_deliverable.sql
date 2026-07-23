-- Vibe Studio full-modality Model Router — the DELIVERABLE persistence store (§7/§10/§12/§18).
--
-- The extended model-router (_shared/model-router.ts callModel) now produces BINARY and text
-- artifacts across every modality — images, 3D models, voice audio, rendered docs, and text
-- deliverables. Every produced artifact is persisted once, in ONE place, so a generation is never
-- lost and Paige can reference/return it later. This is that home: a thin provenance + pointer row
-- (studio_deliverable) whose bytes live in the private 'studio-deliverables' storage bucket under a
-- leading tenant_id path segment. The row records WHAT was made, by WHICH provider/model/tier, at
-- WHAT estimated cost, and BY WHOM — never a secret, never the API key (§11/§13).
--
-- Doctrine:
--   §9  — tenant-scoped + RLS; every row and every object pinned to the caller's tenant. The RLS
--         predicate is copied VERBATIM from the sibling studio_library_items (admin|super_admin|
--         coach on their own tenant, platform admin sees all, service-role/Paige bypass), and the
--         bucket policy is copied from the private 'tenant-knowledge' bucket (tenant-folder scope).
--   §10 — the router writes via the service-role seam; the same rows are readable by voice/text, so
--         Paige can list/return a tenant's deliverables without a human clicking in the UI.
--   §12 — one home per capability: this is the single deliverables store, not a per-modality fork.
--   §13 — a persisted deliverable is the honest record of what was actually generated (provider,
--         model, tokens, cost estimate) — never a hoped-for result.
--   §2  — tenant-generic by construction; no vertical/finance default is ever seeded here.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS) so a re-apply is safe.

-- ── 1) The deliverable provenance table ─────────────────────────────────────────────────────
-- tenant_id FKs public.tenants(id) ON DELETE CASCADE — the SAME convention the sibling studio_*
-- tables use (studio_library_items). created_by is a required author stamp; it is intentionally
-- NOT hard-FK'd to auth.users (the router persists via the service-role seam and stamps the actor
-- id, and we never want a user deletion to RESTRICT or cascade-nuke a tenant's deliverables — the
-- tenant CASCADE above is the only lifecycle coupling we want). parent_deliverable_id self-refs so
-- a derived artifact (e.g. a text-to-image off a drafted brief) can point at its source.
CREATE TABLE IF NOT EXISTS public.studio_deliverable (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode                  text NOT NULL,                              -- the Studio mode/route label (e.g. 'image','doc')
  modality              text NOT NULL,                              -- Modality union: text|image|image-with-text|3d|audio-voice|doc-render
  artifact_storage_key  text,                                      -- object path in 'studio-deliverables' (NULL for pure-text results)
  provider              text NOT NULL,                              -- e.g. anthropic|openai|groq|gemini|ideogram|replicate|meshy|elevenlabs
  model                 text NOT NULL,                              -- concrete model id used
  tier                  text NOT NULL,                              -- Tier union: frontier|open-fast|open-flexible
  cost_estimate_usd     numeric(10,4),                             -- clearly-labeled ESTIMATE from the router's cost table
  created_by            uuid NOT NULL,                             -- author (actor) stamp; see note above re: no hard FK
  parent_deliverable_id uuid REFERENCES public.studio_deliverable(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,        -- caller_function, tokens, latency, brand_voice — NEVER a key/secret
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_deliverable_tenant_created_idx
  ON public.studio_deliverable (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studio_deliverable_tenant_mode_idx
  ON public.studio_deliverable (tenant_id, mode);

ALTER TABLE public.studio_deliverable ENABLE ROW LEVEL SECURITY;

-- Access shape copied VERBATIM from studio_library_items: admins/coaches manage their own tenant's
-- deliverables; platform admin sees all; Paige (service-role) drives it on their behalf.
DROP POLICY IF EXISTS studio_deliverable_tenant_manage ON public.studio_deliverable;
CREATE POLICY studio_deliverable_tenant_manage ON public.studio_deliverable
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

DROP POLICY IF EXISTS studio_deliverable_service ON public.studio_deliverable;
CREATE POLICY studio_deliverable_service ON public.studio_deliverable
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── 2) The private 'studio-deliverables' storage bucket ─────────────────────────────────────
-- Private (public=false); the router uploads via the service-role client and hands back a signed
-- URL (30-day). Objects are stored under a leading path segment = tenant_id, so RLS scopes every
-- object to its tenant — mirroring the private 'tenant-knowledge' bucket. mime allow-list is
-- intentionally omitted: the router is the real gatekeeper (it knows the actual bytes/modality),
-- and produced artifacts span image/model/audio/pdf types. 100 MB ceiling covers 3D/audio outputs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('studio-deliverables', 'studio-deliverables', false, 104857600) -- 100 MB
ON CONFLICT (id) DO NOTHING;

-- Per-tenant RLS on storage.objects, keyed on the leading path segment (storage.foldername(name))[1]
-- = tenant_id. Read/write = any active tenant member; platform owner overrides. Copied from the
-- 'tenant-knowledge' member-write shape (kb_bucket_member_write) — the router's service-role writes
-- bypass RLS, and members read/manage their own tenant's folder.
DROP POLICY IF EXISTS "studio_deliverables read own files" ON storage.objects;
CREATE POLICY "studio_deliverables read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'studio-deliverables'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "studio_deliverables upload own files" ON storage.objects;
CREATE POLICY "studio_deliverables upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'studio-deliverables'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "studio_deliverables update own files" ON storage.objects;
CREATE POLICY "studio_deliverables update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'studio-deliverables'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "studio_deliverables delete own files" ON storage.objects;
CREATE POLICY "studio_deliverables delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'studio-deliverables'
    AND (
      public.is_platform_owner()
      OR public.is_tenant_member(((storage.foldername(name))[1])::uuid)
    )
  );
