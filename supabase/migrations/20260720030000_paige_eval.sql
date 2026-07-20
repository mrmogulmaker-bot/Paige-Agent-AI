-- 20260720030000_paige_eval.sql
--
-- §34 Layer 2 (Quality/Evals) — Slice 1 schema. The internal "Evals" department (NOT Braintrust):
-- a dataset of eval CASES → an eval RUN that scores a target (a prompt template, a reasoning
-- primitive, a job_kind, or a batch of real paige_llm_trace rows) with a set of SCORERS →
-- per-case RESULTS. This is how Paige measures whether a change to her intelligence made outputs
-- BETTER or WORSE, on real traced data (§34 build order L1 → L4 → L2 → L5; L1 traces are the input
-- substrate this scores over).
--
-- Ships INERT/opt-in: these tables + the paige-eval edge fn exist and are directly invokable by an
-- admin/coach JWT, but NOTHING auto-triggers them (no cron, no wire into paige-deep-research). An
-- eval only runs when a caller asks.
--
-- DOCTRINE (mirrors studio_visual_critique_log's RLS posture + paige_llm_trace's honesty rules):
--   §9  — tenant_id is a SOFT correlation id (nullable, NO FK): NULL = a PLATFORM/GOLDEN dataset
--         (operator-owned, coaching-generic) — never readable by any tenant. A tenant reads ONLY its
--         own rows via current_user_tenant_id(); the read policy is EXPLICIT about NULL so a platform
--         row is invisible to every tenant, not exposed by a 3-valued-logic accident. Service-role
--         writes ONLY — a tenant cannot plant forged/dishonest eval rows scoped to itself. There is
--         intentionally NO God/platform read policy (same posture as paige_llm_trace).
--   §13/§31 — a score of NULL is an HONEST "could not score" (missing rubric/config, judge errored),
--         NEVER a fabricated pass. aggregate_score is NULL when nothing scored — never 0-coerced
--         (mirrors paige_llm_trace cost: null ≠ zero). A pass is only ever recorded on a REAL score.
--   §17 — the llm_judge scorer routes through the model router's "plan" (Claude reasoning) tier by
--         construction — a judge NEVER runs on an open model. (Enforced in the edge/scorer code; the
--         schema records judge_model so the routing is auditable here.)
--
-- Idempotent; ADDITIVE only. Reverse (dev only) with, in FK order:
--   DROP TABLE IF EXISTS public.paige_eval_result;
--   DROP TABLE IF EXISTS public.paige_eval_run;
--   DROP TABLE IF EXISTS public.paige_eval_case;
--   DROP TABLE IF EXISTS public.paige_eval_dataset;

-- ── paige_eval_dataset — a named collection of eval cases for one TARGET ──────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_eval_dataset (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,                                  -- SOFT (nullable, no FK). NULL = platform/golden set (§9).
  name         text NOT NULL,
  description  text,
  target_kind  text NOT NULL,                         -- what this dataset evaluates
  target_ref   text,                                  -- the concrete target id/name (e.g. template id, job_kind)
  status       text NOT NULL DEFAULT 'active',
  created_by   uuid,                                  -- actor stamp; NULL for the service/system seam
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_eval_dataset_target_kind_chk
    CHECK (target_kind IN ('prompt_template', 'reasoning_primitive', 'job_kind', 'trace_batch')),
  CONSTRAINT paige_eval_dataset_status_chk
    CHECK (status IN ('active', 'archived'))
);
CREATE INDEX IF NOT EXISTS paige_eval_dataset_tenant_time_idx
  ON public.paige_eval_dataset (tenant_id, created_at DESC);

COMMENT ON TABLE public.paige_eval_dataset IS
  '§34-L2 evals: a named set of eval cases for one target (prompt_template/reasoning_primitive/job_kind/trace_batch). tenant_id NULL = platform/golden set, never tenant-readable (§9).';
COMMENT ON COLUMN public.paige_eval_dataset.tenant_id IS
  'SOFT correlation id (nullable, no FK). NULL = platform/golden dataset (operator-owned); non-null = tenant-scoped (§9).';

-- ── paige_eval_case — one graded example (input → expected), optionally sourced from a real trace ──
CREATE TABLE IF NOT EXISTS public.paige_eval_case (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id      uuid REFERENCES public.paige_eval_dataset(id) ON DELETE CASCADE,
  tenant_id       uuid,                               -- SOFT (nullable, no FK); stamped = dataset's tenant (§9)
  input           jsonb NOT NULL,                     -- the task/prompt/trace payload to score
  expected        jsonb,                              -- gold output/label, when the scorer needs a reference
  source_trace_id uuid,                               -- soft link to the paige_llm_trace row a case was mined from
  rubric          text,                               -- llm-judge rubric OR a deterministic scorer's pattern/config
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paige_eval_case_dataset_idx
  ON public.paige_eval_case (dataset_id);
CREATE INDEX IF NOT EXISTS paige_eval_case_tenant_time_idx
  ON public.paige_eval_case (tenant_id, created_at DESC);

COMMENT ON TABLE public.paige_eval_case IS
  '§34-L2 evals: one graded example (input + optional expected/rubric) belonging to a dataset. tenant_id soft-scoped (§9); NULL = platform/golden.';

-- ── paige_eval_run — one scoring pass over a dataset/target with a scorer set ──────────────────────
CREATE TABLE IF NOT EXISTS public.paige_eval_run (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid,                             -- SOFT (nullable, no FK) (§9)
  dataset_id        uuid REFERENCES public.paige_eval_dataset(id) ON DELETE SET NULL,
  target_kind       text,                             -- denormalized from the dataset/selector for slicing
  target_ref        text,
  target_version    text,                             -- which version of the target was scored (e.g. template version)
  status            text NOT NULL DEFAULT 'running',
  scorer_set        text[],                           -- which scorers this run applied
  case_count        integer NOT NULL DEFAULT 0,       -- cases considered
  scored_count      integer NOT NULL DEFAULT 0,       -- results that produced a REAL (non-null) score
  degraded_count    integer NOT NULL DEFAULT 0,       -- results that could NOT score (needs_config/low_confidence/error)
  aggregate_score   numeric(6,4),                     -- mean over REAL scores only; NULL when nothing scored (never 0-coerced — mirrors trace cost null≠zero, §13/§31)
  pass_rate         numeric(5,4),                     -- fraction passed over the scored cases; NULL when nothing scored
  cost_estimate_usd numeric(10,6),                    -- clearly-labeled ESTIMATE (judge calls), never a bill; NULL when no basis
  prev_run_id       uuid,                             -- soft link to the baseline run this is compared against (regression check)
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  CONSTRAINT paige_eval_run_status_chk
    CHECK (status IN ('running', 'complete', 'error', 'needs_config'))
);
CREATE INDEX IF NOT EXISTS paige_eval_run_tenant_time_idx
  ON public.paige_eval_run (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paige_eval_run_target_time_idx
  ON public.paige_eval_run (target_kind, target_ref, created_at DESC);

COMMENT ON TABLE public.paige_eval_run IS
  '§34-L2 evals: one scoring pass over a dataset/target. aggregate_score is the mean over REAL scores only and is NULL when nothing scored — never 0-coerced (null ≠ zero, §13/§31). Ships inert: no cron/auto-trigger.';
COMMENT ON COLUMN public.paige_eval_run.aggregate_score IS
  'Mean over cases that produced a real (non-null) score. NULL when scored_count = 0 — an honest could-not-score, NEVER a fabricated 0 (mirrors paige_llm_trace cost null≠zero, §13/§31).';

-- ── paige_eval_result — one scorer's verdict on one case ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_eval_result (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid REFERENCES public.paige_eval_run(id) ON DELETE CASCADE,
  tenant_id         uuid,                             -- SOFT (nullable, no FK); stamped = resolved/trace tenant (§9)
  case_id           uuid,                             -- soft link to paige_eval_case (or NULL for a trace-batch result)
  source_trace_id   uuid,                             -- soft link to the scored paige_llm_trace row, when scoring traces
  scorer            text NOT NULL,                    -- scorer name (e.g. 'exact_match', 'rubric_judge')
  scorer_kind       text NOT NULL,                    -- 'deterministic' | 'llm_judge'
  score             numeric(6,4),                     -- NULL = honest could-not-score, NEVER a fabricated pass (§31)
  passed            boolean,                          -- NULL when not scored
  status            text NOT NULL,                    -- 'scored' | 'needs_config' | 'low_confidence' | 'error'
  rationale         text,                             -- judge's reason / scorer note
  judge_model       text,                             -- concrete model id when scorer_kind='llm_judge' (§17 auditable)
  cost_estimate_usd numeric(10,6),                    -- ESTIMATE for this scorer call; NULL for deterministic/no basis
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_eval_result_scorer_kind_chk
    CHECK (scorer_kind IN ('deterministic', 'llm_judge')),
  CONSTRAINT paige_eval_result_status_chk
    CHECK (status IN ('scored', 'needs_config', 'low_confidence', 'error'))
);
CREATE INDEX IF NOT EXISTS paige_eval_result_run_idx
  ON public.paige_eval_result (run_id);
CREATE INDEX IF NOT EXISTS paige_eval_result_tenant_time_idx
  ON public.paige_eval_result (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paige_eval_result_trace_idx
  ON public.paige_eval_result (source_trace_id) WHERE source_trace_id IS NOT NULL;

COMMENT ON TABLE public.paige_eval_result IS
  '§34-L2 evals: one scorer''s verdict on one case. score NULL = honest could-not-score, NEVER a fabricated pass (§31); judge_model records §17 routing so the frontier-only judge is auditable.';
COMMENT ON COLUMN public.paige_eval_result.score IS
  'NULL = honest could-not-score (missing rubric/config, judge errored). NEVER a defaulted/fabricated pass (§31). A pass is only recorded on a real score.';

-- ── RLS: mirror studio_visual_critique_log EXACTLY (service-role FOR ALL; tenant SELECT own only) ──
-- Each read policy is EXPLICIT about NULL (platform/golden rows invisible to every tenant, §9). No
-- authenticated INSERT/UPDATE/DELETE — creation is the service-role edge seam (paige-eval), which sets
-- tenant_id explicitly and only records a run that actually happened (§13). No God/platform read policy.

ALTER TABLE public.paige_eval_dataset ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paige_eval_dataset_service ON public.paige_eval_dataset;
CREATE POLICY paige_eval_dataset_service ON public.paige_eval_dataset
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS paige_eval_dataset_tenant_read ON public.paige_eval_dataset;
CREATE POLICY paige_eval_dataset_tenant_read ON public.paige_eval_dataset
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id());
GRANT SELECT ON public.paige_eval_dataset TO authenticated;
GRANT ALL ON public.paige_eval_dataset TO service_role;

ALTER TABLE public.paige_eval_case ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paige_eval_case_service ON public.paige_eval_case;
CREATE POLICY paige_eval_case_service ON public.paige_eval_case
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS paige_eval_case_tenant_read ON public.paige_eval_case;
CREATE POLICY paige_eval_case_tenant_read ON public.paige_eval_case
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id());
GRANT SELECT ON public.paige_eval_case TO authenticated;
GRANT ALL ON public.paige_eval_case TO service_role;

ALTER TABLE public.paige_eval_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paige_eval_run_service ON public.paige_eval_run;
CREATE POLICY paige_eval_run_service ON public.paige_eval_run
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS paige_eval_run_tenant_read ON public.paige_eval_run;
CREATE POLICY paige_eval_run_tenant_read ON public.paige_eval_run
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id());
GRANT SELECT ON public.paige_eval_run TO authenticated;
GRANT ALL ON public.paige_eval_run TO service_role;

ALTER TABLE public.paige_eval_result ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paige_eval_result_service ON public.paige_eval_result;
CREATE POLICY paige_eval_result_service ON public.paige_eval_result
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS paige_eval_result_tenant_read ON public.paige_eval_result;
CREATE POLICY paige_eval_result_tenant_read ON public.paige_eval_result
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id());
GRANT SELECT ON public.paige_eval_result TO authenticated;
GRANT ALL ON public.paige_eval_result TO service_role;
