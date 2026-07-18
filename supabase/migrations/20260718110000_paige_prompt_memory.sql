-- Compound AI System — Phase B: paige_prompt_memory (semantic memory of what worked) + RLS +
-- ivfflat cosine index (CLAUDE.md §26, §7 tenant-authored, §9 platform-vs-tenant).
--
-- On a GENUINE success, the prompt-forge (_shared/prompt-forge.ts captureToMemory) remembers the
-- forged prompt + its produced artifact as a vector, so future forges can retrieve what worked for
-- THIS tenant. The embedding is the ONE canonical space — voyage-3 @ 1024 dims (_shared/voyage.ts) —
-- and every row is tagged embedding_model/embedding_dim so the space is auditable and never mixed.
--
-- Doctrine:
--   §9  — tenant_id NOT NULL + RLS; a tenant reads/writes ONLY its own memories. No platform-default
--         READ policy here (a memory is a tenant's private learning, never shared cross-tenant, §9).
--   §13 — a row exists ONLY for a real success (the forge writes nothing on needs_config/error), so a
--         memory is always an honest record; artifact_url is a real produced artifact or NULL.
--   §17 — the embedding is voyage-3 ONLY (no frontier/generation embedding path); tag columns pin it.
--   §2  — no finance/credit language is ever remembered into a platform-default context (forge guard).
--
-- Idempotent; ADDITIVE only. The vector type lives in the extensions schema (pgvector 0.8.0).

CREATE TABLE IF NOT EXISTS public.paige_prompt_memory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  modality          text NOT NULL,                 -- Modality union
  provider          text NOT NULL,                 -- provider slug that produced the artifact
  model             text NOT NULL,                 -- concrete model id used
  tier              text,                          -- Tier union: frontier|open-fast|open-flexible
  template_name     text,                          -- the template this forge used, if any
  template_id       uuid REFERENCES public.paige_prompt_template(id) ON DELETE SET NULL,
  user_intent       text NOT NULL,                 -- the tenant's brief in their words
  prompt_text       text NOT NULL,                 -- the fully-resolved forged prompt (bracket-free)
  artifact_url      text,                          -- signed/vendor URL of the real produced artifact (honest; NULL for pure text)
  deliverable_id    uuid,                          -- studio_deliverable.id when the router persisted one (no hard FK — soft link)
  embedding         extensions.vector(1024) NOT NULL,  -- voyage-3 @ 1024; NOT NULL enforces honest capture
  embedding_model   text NOT NULL DEFAULT 'voyage-3',
  embedding_dim     integer NOT NULL DEFAULT 1024,
  tenant_rating     integer,                       -- optional 1..5 tenant feedback on the result
  cost_estimate_usd numeric(10,4),                 -- clearly-labeled ESTIMATE, never a billed figure
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- tokens/latency — NEVER a secret
  created_by        uuid,                          -- actor stamp; NULL for the service/system seam
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_prompt_memory_rating_chk
    CHECK (tenant_rating IS NULL OR tenant_rating BETWEEN 1 AND 5),
  CONSTRAINT paige_prompt_memory_dim_chk
    CHECK (embedding_dim = 1024)
);

CREATE INDEX IF NOT EXISTS paige_prompt_memory_tenant_modality_idx
  ON public.paige_prompt_memory (tenant_id, modality, created_at DESC);

-- ivfflat cosine index for semantic retrieval. Opclass is schema-qualified (extensions) so the index
-- builds regardless of the migration search_path; lists=100 matches the sibling embedding indexes.
CREATE INDEX IF NOT EXISTS paige_prompt_memory_embedding_idx
  ON public.paige_prompt_memory
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.paige_prompt_memory ENABLE ROW LEVEL SECURITY;

-- Tenant self-scope (§9/§13): a tenant may READ its own memories and set a rating on them, but may NOT
-- create or delete rows directly. Creation is the service-role honest-capture path ONLY — the §17
-- voyage-only embedding, the §13 "row only on genuine success", and the §2 finance re-scan all live in
-- captureToMemory (the edge function). A direct authenticated INSERT via PostgREST would bypass every one
-- of those guards (it can't leak cross-tenant — RLS holds — but it could plant a dishonest/off-space
-- memory). So authenticated gets SELECT + a column-scoped UPDATE of tenant_rating; INSERT/DELETE are
-- service-role only.
DROP POLICY IF EXISTS paige_prompt_memory_tenant ON public.paige_prompt_memory;      -- drop the prior FOR ALL policy if re-applied
DROP POLICY IF EXISTS paige_prompt_memory_tenant_read ON public.paige_prompt_memory;
CREATE POLICY paige_prompt_memory_tenant_read ON public.paige_prompt_memory
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS paige_prompt_memory_tenant_rate ON public.paige_prompt_memory;
CREATE POLICY paige_prompt_memory_tenant_rate ON public.paige_prompt_memory
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_user_tenant_id())
  WITH CHECK (tenant_id = public.current_user_tenant_id());

-- Service-role seam: the forge writes memories via service role (captureToMemory).
DROP POLICY IF EXISTS paige_prompt_memory_service ON public.paige_prompt_memory;
CREATE POLICY paige_prompt_memory_service ON public.paige_prompt_memory
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Column-scoped grant: tenants read everything on their rows but can only WRITE tenant_rating (the
-- feedback seam). No INSERT/DELETE for authenticated — the honest-capture path owns creation.
GRANT SELECT ON public.paige_prompt_memory TO authenticated;
GRANT UPDATE (tenant_rating) ON public.paige_prompt_memory TO authenticated;
GRANT ALL ON public.paige_prompt_memory TO service_role;
