-- 20260719140000_studio_visual_critique_log.sql
--
-- WHY THIS EXISTS (CLAUDE.md §25/§33): the Studio design agent's visual-critique loop — it renders a
-- generated artifact to a screenshot, reads it with a Claude VISION model, and gets a SHIP/ITERATE/
-- BLOCK verdict before the artifact reaches the tenant. This table is the AUDIT of every critique the
-- studio-visual-critique edge function runs: what was judged, the verdict, the findings, the model,
-- and the per-call + running cost (so the §33 cost cap is auditable). It is a log, not a source of
-- truth for artifacts.
--
-- Doctrine:
--   §9  — tenant_id NOT NULL + RLS; a tenant reads ONLY its own critique rows. Rows are written by the
--         service-role edge seam (which sets tenant_id explicitly); a direct authenticated INSERT is
--         not permitted (creation is the honest edge path only), mirroring paige_prompt_memory.
--   §13 — a row is an HONEST record of a critique that actually ran (the edge fn writes nothing on a
--         needs_config/no-screenshot degrade); low_confidence marks a fail-open (critic malfunctioned).
--   §33 — cost_estimate_usd (this call) + spent_usd (running loop total) make the cost cap auditable;
--         capped=true marks a row where the loop was stopped by the iteration/cost ceiling.
--
-- Idempotent; ADDITIVE only. Reverse with: DROP TABLE IF EXISTS public.studio_visual_critique_log;

CREATE TABLE IF NOT EXISTS public.studio_visual_critique_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id        uuid,                          -- soft link to the Studio session (no hard FK)
  deliverable_id    uuid,                          -- soft link to studio_deliverable, if any
  artifact_kind     text NOT NULL,                 -- image | page | funnel | form
  image_source      text NOT NULL,                 -- 'image_url' (existing raster) or 'render' (Fly-rendered)
  iteration         integer NOT NULL DEFAULT 0,    -- which loop pass this critique is
  verdict           text NOT NULL,                 -- SHIP | ITERATE | BLOCK
  summary           text,                          -- one-sentence headline judgment
  findings          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {blockers,should_fix,nits,cheesy_tells_hit}
  model             text,                          -- concrete vision model id that judged (NULL on cap/fail-open)
  cost_estimate_usd numeric(10,4),                 -- clearly-labeled ESTIMATE for THIS call
  spent_usd         numeric(10,4),                 -- running loop total after this call (§33 cost cap)
  capped            boolean NOT NULL DEFAULT false, -- loop stopped by the iteration/cost ceiling
  low_confidence    boolean NOT NULL DEFAULT false, -- fail-open: critic errored / reply unparseable
  created_by        uuid,                          -- actor stamp; NULL for the service/system seam
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_visual_critique_verdict_chk
    CHECK (verdict IN ('SHIP', 'ITERATE', 'BLOCK')),
  CONSTRAINT studio_visual_critique_kind_chk
    CHECK (artifact_kind IN ('image', 'page', 'funnel', 'form'))
);

CREATE INDEX IF NOT EXISTS studio_visual_critique_log_tenant_idx
  ON public.studio_visual_critique_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS studio_visual_critique_log_session_idx
  ON public.studio_visual_critique_log (session_id, created_at DESC);

ALTER TABLE public.studio_visual_critique_log ENABLE ROW LEVEL SECURITY;

-- Tenant self-scope (§9): a tenant may READ its own critique rows. No authenticated INSERT/UPDATE/
-- DELETE — the honest capture path (the service-role edge function, which sets tenant_id explicitly
-- and only logs a critique that actually ran, §13) owns creation. Mirrors paige_prompt_memory.
DROP POLICY IF EXISTS studio_visual_critique_log_tenant_read ON public.studio_visual_critique_log;
CREATE POLICY studio_visual_critique_log_tenant_read ON public.studio_visual_critique_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id());

DROP POLICY IF EXISTS studio_visual_critique_log_service ON public.studio_visual_critique_log;
CREATE POLICY studio_visual_critique_log_service ON public.studio_visual_critique_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.studio_visual_critique_log TO authenticated;
GRANT ALL ON public.studio_visual_critique_log TO service_role;
