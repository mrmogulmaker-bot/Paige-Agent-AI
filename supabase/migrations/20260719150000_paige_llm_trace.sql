-- §34 Layer 1 — Observability: paige_llm_trace, the dedicated LLM trace store.
--
-- Every LLM call Paige makes gets one row: provider/model, tokens, latency, a clearly-labeled COST
-- ESTIMATE, tenant/task/agent correlation, a parent_trace_id for multi-agent trees, and a SCRUBBED +
-- TRUNCATED excerpt of the input/output. This is the substrate the rest of §34 measures against
-- (evals score traced outputs; A/B picks winners by traced scores; learning weights by traced
-- reactions). It EXTENDS the router seam — it does NOT replace paige_audit_log, which keeps its
-- distinct governance/audit job (§18 one home per capability).
--
-- SECURITY POSTURE (from the §34 Phase-0 adversarial pre-flight — this is NOT paige_prompt_memory,
-- which only ever stored a bracket-free forged prompt; a trace of full I/O is a materially larger
-- blast radius, so the guards are deliberately stronger):
--   §0/S0 SECRETS & PII — input_excerpt/output_excerpt/error_message are SCRUBBED of credential shapes
--         (sk-/sk-ant-/AKIA/Bearer/JWT/signed-URL tokens/long hex) by the writer BEFORE insert, and
--         truncated to a 32KB cap. They MAY still contain tenant/client PII (that is the point of a
--         trace) — so this table is a client-personal-data store under §9 and is EXCLUDED from any
--         platform/God read path. NEVER a secret. metadata is an allowlist of scalar keys, never a raw
--         opts/headers dump (mirrors paige_prompt_memory's "metadata NEVER a secret", §13).
--   §9/S2 TENANT ISOLATION — service-role writes ONLY; a tenant reads ONLY its own rows via
--         current_user_tenant_id(). The read policy is EXPLICIT about NULL (platform/system rows have
--         tenant_id = NULL and are invisible to every tenant) rather than relying on 3-valued-logic.
--         There is intentionally NO platform-owner read policy — the God account cannot read raw
--         tenant prompts/outputs here (same posture as paige_prompt_memory). Aggregate cost/token
--         views for operators must be a PII-free VIEW, never raw-row access.
--   §13/S1 HONEST NON-BLOCKING — the writer detaches via EdgeRuntime.waitUntil (never awaited on the
--         response path), so tracing a multi-KB row never adds latency to the actual generation. It is
--         best-effort and MAY drop a row under isolate teardown — stated honestly here, not claimed as
--         "logs every call with certainty".
--   §13/S4 COST — cost_estimate_usd is a clearly-labeled ESTIMATE (public list price, in+out tokens,
--         excludes caching/thinking/tool round-trips), NEVER a billed figure. NULL when there is no
--         basis — never coerced to 0 (null cost ≠ zero cost).
--   §24/S3 BLOAT & RETENTION — I/O is capped at 32KB with truncation flags + original length; binary
--         artifacts are referenced by deliverable_id, never inlined. RETENTION: this table is intended
--         to be pruned to ~90 days (a scheduled purge is a tracked fast-follow — see §34 Phase-1
--         follow-ups); do NOT treat it as an append-only-forever store.
--   §34/S5 NO VENDOR SUBSTRATE — pure Supabase Postgres. No Langfuse/Braintrust/OTel-LLM exporter.
--
-- Idempotent; ADDITIVE only.

CREATE TABLE IF NOT EXISTS public.paige_llm_trace (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),           -- IS the trace id
  tenant_id          uuid REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL = platform/system call
  task_id            text,                                                 -- correlates all traces for one task
  agent_id           text,                                                 -- which sub-agent/caller made the call
  parent_trace_id    uuid REFERENCES public.paige_llm_trace(id) ON DELETE SET NULL, -- multi-agent tree
  provider           text NOT NULL,                                        -- anthropic|openai|groq|featherless|gemini|…
  model              text,
  job_kind           text,                                                 -- router JobKind / modality:tier, for slicing
  modality           text,
  tier               text,
  status             text NOT NULL,                                        -- 'success' | 'error' | 'needs_config'
  tokens_in          integer,                                              -- NULL when provider didn't report (never 0-coerced)
  tokens_out         integer,
  latency_ms         integer,
  cost_estimate_usd  numeric(10,6),                                        -- ESTIMATE only, never a bill; NULL when no basis
  cost_basis         text,                                                 -- e.g. 'list price, in+out tokens, excl caching, 2026-07'
  input_excerpt      text,                                                 -- SCRUBBED + truncated (32KB); MAY hold PII, NEVER a secret
  output_excerpt     text,                                                 -- SCRUBBED + truncated (32KB); MAY hold PII, NEVER a secret
  input_truncated    boolean NOT NULL DEFAULT false,
  output_truncated   boolean NOT NULL DEFAULT false,
  input_len          integer,                                              -- original char length before truncation
  output_len         integer,
  error_class        text,                                                 -- null on success
  error_message      text,                                                 -- SCRUBBED; null on success
  deliverable_id     uuid,                                                 -- reference to a persisted artifact (never inline bytes)
  doctrine_gate_hits jsonb,                                                -- §17/§2/§3/§9 gate outcomes, if any
  router_version     text,                                                 -- provenance: which router/estimator/scrubber produced this row
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,                   -- allowlisted scalar keys ONLY; NEVER a secret
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_llm_trace_status_chk CHECK (status IN ('success', 'error', 'needs_config'))
);

-- Query shapes: recent by tenant, all traces for a task, the multi-agent tree, and a plain created_at
-- for the retention purge. Deliberately NO GIN index on input/output — that would index the very PII
-- the excerpts are meant to contain, and bloat the index.
CREATE INDEX IF NOT EXISTS paige_llm_trace_tenant_time_idx  ON public.paige_llm_trace (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS paige_llm_trace_task_idx         ON public.paige_llm_trace (task_id, created_at) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paige_llm_trace_parent_idx       ON public.paige_llm_trace (parent_trace_id) WHERE parent_trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paige_llm_trace_created_idx       ON public.paige_llm_trace (created_at);

ALTER TABLE public.paige_llm_trace ENABLE ROW LEVEL SECURITY;

-- Service-role seam owns creation (the router writes via service role; the §0 scrub, §9 tenant stamp,
-- and §13 honesty all live in the writer). A direct authenticated INSERT is impossible — otherwise a
-- tenant could plant forged/dishonest trace rows scoped to itself.
DROP POLICY IF EXISTS paige_llm_trace_service ON public.paige_llm_trace;
CREATE POLICY paige_llm_trace_service ON public.paige_llm_trace
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Tenant self-scope READ ONLY. EXPLICIT about NULL (platform/system rows are invisible to tenants) —
-- an isolation boundary must never rely on a 3-valued-logic accident. NO platform-owner/God policy:
-- raw prompts + client PII are never readable cross-tenant, not even by the operator (§9).
DROP POLICY IF EXISTS paige_llm_trace_tenant_read ON public.paige_llm_trace;
CREATE POLICY paige_llm_trace_tenant_read ON public.paige_llm_trace
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND tenant_id = public.current_user_tenant_id());

GRANT SELECT ON public.paige_llm_trace TO authenticated;   -- read own rows only (RLS above)
GRANT ALL ON public.paige_llm_trace TO service_role;        -- writer path
-- No INSERT/UPDATE/DELETE grant to authenticated — creation is the service-role honest-capture path only.
