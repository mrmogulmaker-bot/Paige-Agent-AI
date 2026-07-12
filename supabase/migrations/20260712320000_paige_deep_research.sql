-- Paige Deep-Research engine (#166) + lender-research anti-fabrication audit (#165).
--
-- Durable, auditable storage for a real cited research run: the run + its ranked
-- sources, so any answer Paige gives is traceable to the pages it read. Scoping
-- MIRRORS lender_research_results EXACTLY (user_id + has_role(admin/coach) +
-- service_role + client-profile view) — there is no tenant_id predicate on that
-- surface, so we do not invent one here (§13 truthful-to-schema).

-- ── research_runs — one row per deep-research investigation ───────────────────
CREATE TABLE IF NOT EXISTS public.research_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,                 -- owner (the coach/admin who ran it)
  client_user_id uuid,                          -- optional: saved to a client's profile
  question       text NOT NULL,
  domain         text NOT NULL DEFAULT 'general', -- 'funding' only from opted-in callers
  caller         text NOT NULL DEFAULT 'chat',    -- chat | lender-research | manual
  findings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage       jsonb NOT NULL DEFAULT '{}'::jsonb,
  stop_reason    text,
  configured     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── research_sources — the ranked, citable sources behind a run ───────────────
CREATE TABLE IF NOT EXISTS public.research_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.research_runs(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,              -- denormalized for RLS parity
  source_index      int  NOT NULL,              -- matches findings[].citations
  url               text NOT NULL,
  title             text,
  snippet           text,
  reliability_score numeric(4,3) NOT NULL DEFAULT 0,
  tier              text,                        -- T1..T5
  reliability       text,                        -- high|medium|low
  published_at      timestamptz,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  excluded          boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS research_runs_user_idx   ON public.research_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_sources_run_idx ON public.research_sources(run_id, source_index);

ALTER TABLE public.research_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sources ENABLE ROW LEVEL SECURITY;

-- Policies mirror lender_research_results EXACTLY (verified from pg_policies).
CREATE POLICY "Admins can manage all research runs" ON public.research_runs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Coaches can manage own research runs" ON public.research_runs
  FOR ALL USING ((auth.uid() = user_id) AND has_role(auth.uid(), 'coach'::app_role));
CREATE POLICY "Users can view runs saved to their profile" ON public.research_runs
  FOR SELECT USING (auth.uid() = client_user_id);
CREATE POLICY "Service role can manage all research runs" ON public.research_runs
  FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can manage all research sources" ON public.research_sources
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Coaches can manage own research sources" ON public.research_sources
  FOR ALL USING ((auth.uid() = user_id) AND has_role(auth.uid(), 'coach'::app_role));
CREATE POLICY "Users can view sources saved to their profile" ON public.research_sources
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.research_runs r
    WHERE r.id = research_sources.run_id AND r.client_user_id = auth.uid()
  ));
CREATE POLICY "Service role can manage all research sources" ON public.research_sources
  FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

-- ── lender_research_results — audit columns for the #165 truthfulness fix ─────
-- `sources` holds the cited, ranked sources behind a verified result; `provenance`
-- distinguishes freshly-verified rows from the legacy rows generated BEFORE live
-- research existed (which may contain fabricated lenders/rates and must be shown
-- as unverified, never silently trusted).
ALTER TABLE public.lender_research_results
  ADD COLUMN IF NOT EXISTS sources    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provenance text  NOT NULL DEFAULT 'unverified_legacy';

-- Everything already persisted predates live research → mark it unverified.
UPDATE public.lender_research_results
   SET provenance = 'unverified_legacy'
 WHERE provenance IS NULL OR provenance = '';
