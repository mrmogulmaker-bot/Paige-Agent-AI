-- ─── STEPS 1+2 — THE CANONICAL USAGE TRACE AND THE METER BRIDGE ──────────────────────────────
--
-- Owner brief, 2026-08-24: "Measure and persist complete provider usage." Instrumentation FIRST;
-- no prompt optimization, no routing change, no budget enforcement until the baseline is proven.
--
-- CORRECTIVE PASS, owner brief 2026-08-24 (second): this file was rewritten in place rather than
-- patched by a follow-up migration, because it has never been applied anywhere — prod's
-- schema_migrations tops out at 20261001000000 and the branch is a draft PR. Editing the unapplied
-- file keeps a from-scratch replay correct; stacking a fix on top would leave the wrong version in
-- the chain forever. Every correction below is marked [C1]..[C8] against that brief.
--
-- WHAT THE AUDIT FOUND, and what each column here answers (every claim verified against source):
--
--  1. `provider` CONFLATES THREE IDENTITIES. `model-router.ts` L427 comments the field as
--     "provider slug for the allow-list + audit + cost", and its ROUTE_TABLE mixes model vendors
--     (anthropic, openai, gemini) with multi-model HOSTS (featherless, groq, replicate). Live data
--     carries exactly two values: 'anthropic' and 'featherless' — one vendor, one gateway, one
--     column. Cost cannot be computed correctly from a field that means different things per row.
--     → gateway_provider / model_provider / billing_provider are now SEPARATE. `provider` is kept
--       untouched for back-compat and is now explicitly the LEGACY slug.
--
--  2. CACHE TOKENS ARE DISCARDED AT A SINGLE LINE. `_shared/claude.ts` L363 maps the Anthropic
--     usage object down to two fields:
--         { prompt_tokens: result.usage.input_tokens, completion_tokens: result.usage.output_tokens }
--     Anthropic also returns cache_read_input_tokens and cache_creation_input_tokens in that same
--     object; both are dropped there and never reach the trace. The streaming path (L484-485, L511)
--     reads input_tokens from message_start and output_tokens from message_delta, and likewise
--     ignores the cache fields.
--     → tokens_cache_read / tokens_cache_write_5m / tokens_cache_write_1h now exist to receive them.
--
--  3. CACHING IS NEVER REQUESTED. `grep -rn cache_control supabase/functions/` returns exactly ONE
--     hit, and it is the prose comment in `_shared/claude.ts` recording this same baseline — zero
--     request bodies set the field. So today every request is a full-price read. That is the
--     BASELINE these columns must prove before Phase 4 changes anything — a cache-hit column that
--     reads 0 is a measurement, not a defect. (Re-run the grep before trusting this line: the
--     moment a real `cache_control` appears the count rises above one and the baseline is stale.)
--
--  4. `tokens_in` IS AMBIGUOUS BY CONSTRUCTION. It receives Anthropic's `usage.input_tokens`, which
--     means TOTAL input while caching is off and UNCACHED input the moment caching is switched on —
--     the same column silently changing meaning. That is a trap for any cost series built on it.
--     → tokens_in_uncached is the unambiguous successor. `tokens_in` is retained and frozen as the
--       legacy field so no existing reader breaks and no history is rewritten.
--
--  5. RETRIES AND TOOL-LOOP ITERATIONS ARE NOT SEPARATE ROWS. parent_trace_id is populated on
--     0 of 640 live rows. The router traces a provider error, a Claude fallback and a success from
--     the same call but nothing links them as attempts of one logical request.
--     → request_id groups the attempts of one logical request; attempt numbers them; is_retry and
--       is_fallback say which kind. parent_trace_id is left alone.
--
--  6. [C5] ATTRIBUTION IS MISSING ON MOST NULL-TENANT ROWS — AND THAT IS NOT THE SAME AS PLATFORM
--     SCOPE. An earlier draft of this file asserted "217 of 640 live rows are platform-scope
--     (operator console, system jobs)". That was WRONG and is corrected here (§13). Verified against
--     prod: only 27 of the 217 carry ANY threaded trace context (26 paige-ai-chat operator-persona,
--     1 research-scout). The other 190 are NULL because the CALLER NEVER THREADED A TraceCtx — e.g.
--     generate-outreach-draft/index.ts resolves a real tenant at :59, uses it at :61, then calls
--     gatewayCompat at :131 with only two arguments. `tenant_id IS NULL` in this table means
--     "attribution missing", not "no tenant existed".
--     → The bridge therefore does NOT treat a null tenant as platform spend. It classifies:
--       a null-tenant trace that carried caller context is 'platform'; one that carried none is
--       'unattributed'. Both are recorded (cost control, [C6]); neither is billed to anyone.
--       Fixing the 190 call sites is edge-function work tracked separately — this schema makes the
--       gap VISIBLE instead of silently dropping it.

-- ─── STEP 1 · IDENTITY ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS gateway_provider text,
  ADD COLUMN IF NOT EXISTS model_provider text,
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS capability text,
  ADD COLUMN IF NOT EXISTS pricing_version text;

COMMENT ON COLUMN public.paige_llm_trace.provider IS
  'LEGACY slug (model-router ROUTE_TABLE). Conflates model vendor and gateway — ''anthropic'' and '
  '''featherless'' both appear. Retained for back-compat; do NOT compute cost from it. Use '
  'model_provider for pricing and billing_provider for reconciliation.';
COMMENT ON COLUMN public.paige_llm_trace.gateway_provider IS
  'The host the HTTP request went to (e.g. featherless, groq, openrouter). NULL when a vendor was called directly.';
COMMENT ON COLUMN public.paige_llm_trace.model_provider IS
  'Who ran the model (anthropic, openai, google, meta...). Decides which price list applies.';
COMMENT ON COLUMN public.paige_llm_trace.billing_provider IS
  'Who invoices us. The gateway when one is in front, otherwise the model provider.';
COMMENT ON COLUMN public.paige_llm_trace.pricing_version IS
  'The paige_model_pricing version that priced this row. NOTE (§13): nothing in the repo SETS this '
  'field yet, so the estimator returns NULL for every current call. That is a known, tracked gap — '
  'the registry is inert until a producer threads it, and an inert estimator is honest, not silent.';

-- ─── STEP 1 · CORRELATION ────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS provider_request_id text,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS conversation_id uuid;

COMMENT ON COLUMN public.paige_llm_trace.request_id IS
  'Groups every ATTEMPT of one logical request. Retries and provider fallbacks share it; attempt '
  'numbers them. Before this column, 0 of 640 rows linked attempts at all.';
COMMENT ON COLUMN public.paige_llm_trace.provider_request_id IS
  'The provider''s own request id. The join key for reconciling an invoice line to a trace row.';
COMMENT ON COLUMN public.paige_llm_trace.user_id IS
  'Server-derived acting user, when one applies. NEVER accepted from a request body.';

-- ─── STEP 1 · USAGE ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS tokens_in_uncached integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_read integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_write_5m integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_write_1h integer,
  ADD COLUMN IF NOT EXISTS tokens_reasoning integer,
  ADD COLUMN IF NOT EXISTS billable_units jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.paige_llm_trace.tokens_in IS
  'LEGACY. Receives Anthropic usage.input_tokens, which means TOTAL input while caching is off and '
  'UNCACHED input once it is on — the same column changing meaning. Frozen; read tokens_in_uncached.';
COMMENT ON COLUMN public.paige_llm_trace.tokens_cache_read IS
  'Cache-read input tokens, billed at 0.1x the uncached rate. NULL = not reported by the provider; '
  '0 = reported as zero. As of this migration no request body sets cache_control, so 0 here is the '
  'expected BASELINE, not a fault.';
COMMENT ON COLUMN public.paige_llm_trace.tokens_reasoning IS
  '[C7] INFORMATIONAL ONLY — NOT a separate billable class and never added to the billable total. '
  'Every provider that reports a reasoning/thinking count reports it as a SUBSET of the output '
  'count (Anthropic bills thinking as output tokens; OpenAI nests reasoning_tokens inside '
  'completion_tokens_details). Summing it alongside tokens_out would double-charge the same tokens. '
  'An earlier draft of this migration did exactly that; corrected here.';
COMMENT ON COLUMN public.paige_llm_trace.billable_units IS
  'Non-token provider charges as {unit: quantity} — web searches, image generations, audio seconds, '
  '3D generations, container-hours. Priced separately from tokens; NOT yet priced by the estimator.';

-- ─── STEP 1 · ATTEMPTS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS attempt smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.paige_llm_trace.attempt IS
  '1-based attempt number within request_id. Every attempt that reached a provider is billable '
  'whether or not it succeeded — a failed attempt that consumed tokens still costs money.';

-- ─── STEP 1 · COST ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS cost_actual_usd numeric(18,10),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

COMMENT ON COLUMN public.paige_llm_trace.cost_estimate_usd IS
  'ESTIMATE from the versioned pricing registry (see pricing_version + cost_basis). Never an invoice.';
COMMENT ON COLUMN public.paige_llm_trace.cost_actual_usd IS
  '[C7] Invoice-CONFIRMED cost. numeric(18,10), NOT (12,6): a single cache-read component can be '
  'well below a micro-dollar (200 cache-read tokens at $0.10/MTok is $0.00002), and a scale that '
  'rounds it to zero would manufacture the exact trustworthy-looking zero this brief forbids. '
  'Stays NULL until a provider invoice is reconciled against provider_request_id. An estimate must '
  'never be written here.';

CREATE INDEX IF NOT EXISTS idx_llm_trace_request ON public.paige_llm_trace (request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_trace_tenant_time ON public.paige_llm_trace (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_trace_provider_request ON public.paige_llm_trace (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

-- ─── [C3] ONE SHARED ELIGIBILITY DEFINITION ──────────────────────────────────────────────────
--
-- Brief: "Create one shared eligibility function or expression so the trigger and detector cannot
-- drift." Previously the trigger summed six token classes while the detector view checked only two
-- (uncached input + output) — so a trace that consumed ONLY cache reads was billable to the trigger
-- and invisible to the detector. Both now call these.
--
-- IMMUTABLE and STRICT-free so they can be used in an index predicate later if needed.

CREATE OR REPLACE FUNCTION public.llm_trace_billable_tokens(
  _tokens_in            integer,
  _tokens_in_uncached   integer,
  _cache_read           integer,
  _cache_write_5m       integer,
  _cache_write_1h       integer,
  _tokens_out           integer
) RETURNS bigint
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  -- tokens_reasoning is deliberately ABSENT: it is a subset of _tokens_out, never an addend ([C7]).
  SELECT COALESCE(_tokens_in_uncached, _tokens_in, 0)::bigint
       + COALESCE(_cache_read, 0)
       + COALESCE(_cache_write_5m, 0)
       + COALESCE(_cache_write_1h, 0)
       + COALESCE(_tokens_out, 0);
$$;

COMMENT ON FUNCTION public.llm_trace_billable_tokens(integer,integer,integer,integer,integer,integer) IS
  'The ONE definition of how many provider-billable tokens a trace consumed. Called by both '
  'meter_llm_trace() and the unmetered detector so the two can never disagree about what is '
  'eligible. Excludes reasoning tokens by design — they are a subset of output, not a class.';

CREATE OR REPLACE FUNCTION public.llm_trace_is_billable(
  _tokens_in            integer,
  _tokens_in_uncached   integer,
  _cache_read           integer,
  _cache_write_5m       integer,
  _cache_write_1h       integer,
  _tokens_out           integer,
  _billable_units       jsonb
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT public.llm_trace_billable_tokens(
           _tokens_in, _tokens_in_uncached, _cache_read, _cache_write_5m, _cache_write_1h, _tokens_out
         ) > 0
      OR COALESCE(_billable_units, '{}'::jsonb) <> '{}'::jsonb;
$$;

COMMENT ON FUNCTION public.llm_trace_is_billable(integer,integer,integer,integer,integer,integer,jsonb) IS
  'Eligibility, shared by the trigger and the detector. A trace is eligible when it consumed any '
  'billable token class OR carries a non-empty billable_units object (searches, images, audio).';

-- ─── [C1] THE VERSIONED PRICING REGISTRY ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paige_model_pricing (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_version          text        NOT NULL,
  model_provider           text        NOT NULL,
  model                    text        NOT NULL,
  input_per_mtok           numeric(12,6),
  cache_read_per_mtok      numeric(12,6),
  cache_write_5m_per_mtok  numeric(12,6),
  cache_write_1h_per_mtok  numeric(12,6),
  output_per_mtok          numeric(12,6),
  currency                 text        NOT NULL DEFAULT 'USD',
  effective_from           timestamptz NOT NULL,
  effective_to             timestamptz,
  source_url               text        NOT NULL,
  verified_on              date        NOT NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_model_pricing_unique UNIQUE (pricing_version, model_provider, model)
);

COMMENT ON TABLE public.paige_model_pricing IS
  'Versioned price list — Paige''s WHOLESALE buy rates. A repricing INSERTs a new pricing_version; '
  'it never UPDATEs an existing row, because traces pin the version that priced them and history '
  'must not move under them. Operator-read only: a tenant seeing the platform''s buy rate is a '
  'commercial leak, not a feature (§9).';
COMMENT ON COLUMN public.paige_model_pricing.source_url IS
  '[C1] The exact official page these rates were read from. Required, not nullable — a price with '
  'no citable source is a guess.';
COMMENT ON COLUMN public.paige_model_pricing.verified_on IS
  '[C1] The date a human/agent actually opened source_url and confirmed these numbers. Distinct '
  'from effective_from, which is when the vendor says the price applies.';
-- NOTE: there is deliberately no reasoning_per_mtok column. Reasoning is billed as output by every
-- provider we route to; a separate rate column would invite the double-count corrected in [C7].

ALTER TABLE public.paige_model_pricing ENABLE ROW LEVEL SECURITY;

-- [C4] Policies use the `TO <role>` form the brief asks for, not `auth.role() = '...'`.
DROP POLICY IF EXISTS paige_model_pricing_operator_read ON public.paige_model_pricing;
CREATE POLICY paige_model_pricing_operator_read ON public.paige_model_pricing
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

DROP POLICY IF EXISTS paige_model_pricing_service_write ON public.paige_model_pricing;
CREATE POLICY paige_model_pricing_service_write ON public.paige_model_pricing
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- [C1] Rates read from https://platform.claude.com/docs/en/about-claude/pricing on 2026-08-24.
-- The previous seed carried Sonnet 5 at $3 in / $15 out. That was doubly wrong: it recorded a price
-- increase that the vendor has since CANCELLED. The official page states verbatim: "The $2/$10 per
-- million input/output token pricing for Claude Sonnet 5, announced at launch as introductory
-- pricing through August 31, 2026, is now the standard price. The previously scheduled increase to
-- $3/$15 per million input/output tokens on September 1, 2026 will not occur."
--
-- HONEST NOTE on effective_from: the same $2/$10 rates were in force earlier as introductory
-- pricing, but the page does not state the launch date, so effective_from records the date this
-- registry verified them rather than inventing an earlier one. Nothing is backfilled, so no
-- historical row is mispriced by that choice.
--
-- The 1-hour rates are no longer NULL. They follow the published multipliers exactly
-- (5m write = 1.25x base, 1h write = 2x base, cache read = 0.1x base), which the seeded numbers
-- satisfy for both models — a cheap arithmetic check on any future reseed.
INSERT INTO public.paige_model_pricing
  (pricing_version, model_provider, model,
   input_per_mtok, cache_read_per_mtok, cache_write_5m_per_mtok, cache_write_1h_per_mtok, output_per_mtok,
   effective_from, source_url, verified_on, notes)
VALUES
  ('2026-08-24', 'anthropic', 'claude-sonnet-5',
   2.000000, 0.200000, 2.500000, 4.000000, 10.000000,
   '2026-08-24T00:00:00Z', 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-24',
   'Standard rate. Vendor cancelled the scheduled 2026-09-01 increase to $3/$15. Thinking tokens are billed as output.'),
  ('2026-08-24', 'anthropic', 'claude-haiku-4-5',
   1.000000, 0.100000, 1.250000, 2.000000, 5.000000,
   '2026-08-24T00:00:00Z', 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-24',
   'Standard rate. Thinking tokens are billed as output.'),
  ('2026-08-24', 'anthropic', 'claude-haiku-4-5-20251001',
   1.000000, 0.100000, 1.250000, 2.000000, 5.000000,
   '2026-08-24T00:00:00Z', 'https://platform.claude.com/docs/en/about-claude/pricing', '2026-08-24',
   'Dated snapshot of claude-haiku-4-5 seen in live traces; identical rates.')
ON CONFLICT (pricing_version, model_provider, model) DO NOTHING;

-- KNOWN, DELIBERATE GAPS in this registry (§13 — stated so no reader assumes coverage):
--   · Only the anthropic models seen in live traces are priced. groq / featherless / openai /
--     gemini / replicate / ideogram / meshy / elevenlabs have NO rows, so the estimator returns
--     NULL for them — visibly unpriced, never a zero.
--   · Pricing MODIFIERS are not modelled: the Batch API 50% discount, the 1.1x data-residency
--     multiplier for inference_geo='us', and fast-mode premium pricing. None is used by the router
--     today; each would need its own column or version before it is.
--   · billable_units (web searches at $10/1k, image generations, audio seconds) are not priced.

-- ─── [C1][C4] THE ESTIMATOR ──────────────────────────────────────────────────────────────────
--
-- [C4] SECURITY INVOKER, not DEFINER. The previous version was SECURITY DEFINER with no in-body
-- caller check and the migration carried no GRANT/REVOKE at all, so it inherited Postgres's default
-- PUBLIC EXECUTE — verified live to be anon-callable — and bypassed RLS to read the wholesale buy
-- rates this very file locks down. As INVOKER it reads paige_model_pricing under the caller's own
-- RLS, so a tenant gets no rows and NULL back. It still works inside the meter trigger because that
-- trigger runs as a role that can read the registry. Belt and braces: EXECUTE is revoked from
-- PUBLIC/anon/authenticated below and granted only to service_role.
CREATE OR REPLACE FUNCTION public.estimate_llm_cost_usd(
  _model_provider text, _model text, _pricing_version text,
  _in_uncached int, _cache_read int, _cache_write_5m int, _cache_write_1h int, _out int
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE p public.paige_model_pricing%ROWTYPE; total numeric := 0;
BEGIN
  IF _model_provider IS NULL OR _model IS NULL OR _pricing_version IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.paige_model_pricing
   WHERE pricing_version = _pricing_version AND model_provider = _model_provider AND model = _model;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- unpriced, and says so
  IF COALESCE(_in_uncached,0)    > 0 THEN
    IF p.input_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_in_uncached::numeric / 1000000) * p.input_per_mtok; END IF;
  IF COALESCE(_cache_read,0)     > 0 THEN
    IF p.cache_read_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_cache_read::numeric / 1000000) * p.cache_read_per_mtok; END IF;
  IF COALESCE(_cache_write_5m,0) > 0 THEN
    IF p.cache_write_5m_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_cache_write_5m::numeric / 1000000) * p.cache_write_5m_per_mtok; END IF;
  IF COALESCE(_cache_write_1h,0) > 0 THEN
    IF p.cache_write_1h_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_cache_write_1h::numeric / 1000000) * p.cache_write_1h_per_mtok; END IF;
  IF COALESCE(_out,0)            > 0 THEN
    IF p.output_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_out::numeric / 1000000) * p.output_per_mtok; END IF;
  -- 10dp, matching cost_actual_usd. Rounding to 6 would flatten a sub-micro-dollar cache-read
  -- component to zero and defeat the cost_known flag ([C7]).
  RETURN round(total, 10);
END; $$;

COMMENT ON FUNCTION public.estimate_llm_cost_usd(text,text,text,int,int,int,int,int) IS
  'Prices one trace from paige_model_pricing. Returns NULL (never 0) for an unpriced model, an '
  'unknown pricing_version, or a missing rate — an unpriced call must not read as a free one. '
  'Reasoning tokens are not a parameter: they are billed as output ([C7]).';


-- ─── [C3][C6] THE COST LEDGER — OPERATOR-ONLY, ONE HOME FOR EVERY SCOPE ──────────────────────
--
-- Owner boundary 3, 2026-08-24: "Wholesale cost must not remain in a tenant-readable row. Separate
-- operator-only cost accounting from tenant-visible usage/credits."
--
-- So the split is now explicit and total:
--   · platform_metered_events  → TENANT-VISIBLE USAGE. Quantity and the per-class token breakdown.
--                                NO wholesale price, NO exact cost, NO rate-derivable field.
--   · paige_llm_cost_ledger    → OPERATOR-ONLY COST. Every call, every scope, with the money on it.
--
-- That closes the derivability hole an earlier draft of this file left open: it locked the price
-- LIST to operators and then wrote the derived per-call price onto platform_metered_events, which
-- is GRANT SELECT TO authenticated and tenant-readable by its own RLS — so wholesale ÷ tokens gave
-- any tenant our buy rate, per model. Locking the list and publishing the quotient is not a posture.
--
-- Why one ledger and not two (§18): cost is one concept. A tenant call, a platform call and an
-- unattributed call differ in WHO it is attributable to, not in what a dollar is. Splitting by scope
-- would give two places to look for the same number and two places for it to drift.
--
-- wholesale_cost_usd is NULLABLE here on purpose. platform_metered_events declares its cost column
-- NOT NULL DEFAULT 0, which turns "we do not know this price" into a confident zero the moment
-- anyone SUMs it. This ledger keeps unknown as NULL so a total is computed over known rows and
-- reported beside a count of unknown ones, never blended ([C7]).
CREATE TABLE IF NOT EXISTS public.paige_llm_cost_ledger (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id              uuid        NOT NULL,
  occurred_at           timestamptz NOT NULL,
  -- [C6] Owner boundary 2: tenant_id IS NULL is exactly TWO explicit states, and neither is guessed.
  --   'tenant'       — a real tenant is attributable; this cost is passthrough-billable.
  --   'platform'     — VERIFIED platform/system scope. Set ONLY when the call site DECLARED it by
  --                    threading scope:'platform' in the trace context. Never inferred.
  --   'unattributed' — no tenant and no declaration. We do not know whose call this was. It is
  --                    recorded so it is countable and fixable, and it is NEVER reported as
  --                    platform usage or charged to anyone.
  scope                 text        NOT NULL,
  tenant_id             uuid,             -- set iff scope = 'tenant'. Soft ref, no FK: an
                                          -- observability-derived cost row must not be lost because
                                          -- its tenant row was deleted.
  model_provider        text,
  model                 text,
  gateway_provider      text,
  billing_provider      text,
  pricing_version       text,
  capability            text,
  job_kind              text,
  tier                  text,
  status                text,
  request_id            uuid,
  attempt               smallint,
  is_retry              boolean,
  is_fallback           boolean,
  tokens_in_uncached    integer,
  tokens_cache_read     integer,
  tokens_cache_write_5m integer,
  tokens_cache_write_1h integer,
  tokens_out            integer,
  tokens_reasoning      integer,     -- [C4-boundary] diagnostic only; NOT in billable_tokens_total
  billable_tokens_total bigint      NOT NULL,
  billable_units        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  wholesale_cost_usd    numeric(18,10),   -- NULL = price unknown. Never defaulted to 0.
  cost_is_estimate      boolean     NOT NULL DEFAULT true,
  -- [C1-precedence] WHERE the number came from, recorded rather than inferred. Without this a
  -- legacy router estimate and an authoritative registry price are indistinguishable once written,
  -- and a reader summing the column cannot tell which rate they are adding up.
  --   'actual'                 — provider/invoice-confirmed cost.
  --   'registry'               — priced by estimate_llm_cost_usd() from paige_model_pricing, the
  --                              versioned rates this migration declares authoritative.
  --   'legacy_router_estimate' — the pre-existing paige_llm_trace.cost_estimate_usd, written by
  --                              model-router.ts at ITS OWN rates. Used ONLY when the registry
  --                              cannot price the row (model_provider/model/pricing_version absent
  --                              or unpriced). Never relabelled as 'registry' to avoid a NULL.
  --   NULL                     — no cost figure at all; wholesale_cost_usd is NULL too.
  cost_source           text,
  currency              text        NOT NULL DEFAULT 'USD',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_llm_cost_ledger_trace_unique UNIQUE (trace_id),
  CONSTRAINT paige_llm_cost_ledger_scope_allowed CHECK (scope IN ('tenant','platform','unattributed')),
  -- The two states cannot blur: a tenant row must name its tenant, and a tenant-less row must not.
  CONSTRAINT paige_llm_cost_ledger_cost_source_allowed CHECK (
    cost_source IS NULL OR cost_source IN ('actual','registry','legacy_router_estimate')),
  -- Provenance and figure travel together: a priced row must say where the price came from, and an
  -- unpriced row must not claim a source. This is what stops a future writer from quietly
  -- back-filling a cost without declaring its rate basis.
  CONSTRAINT paige_llm_cost_ledger_cost_source_matches_cost CHECK (
    (wholesale_cost_usd IS NULL AND cost_source IS NULL)
    OR (wholesale_cost_usd IS NOT NULL AND cost_source IS NOT NULL)),
  CONSTRAINT paige_llm_cost_ledger_scope_matches_tenant CHECK (
    (scope = 'tenant' AND tenant_id IS NOT NULL)
    OR (scope IN ('platform','unattributed') AND tenant_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_llm_cost_ledger_time   ON public.paige_llm_cost_ledger (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost_ledger_scope  ON public.paige_llm_cost_ledger (scope, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost_ledger_tenant ON public.paige_llm_cost_ledger (tenant_id, occurred_at DESC)
  WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE public.paige_llm_cost_ledger IS
  '[C6] Paige''s WHOLESALE cost per model call — every scope, one home, OPERATOR-ONLY. Deliberately '
  'separate from platform_metered_events, which is tenant-readable and therefore carries usage but '
  'never a price: publishing per-call wholesale cost beside a token count hands any tenant our buy '
  'rate by division.';
COMMENT ON COLUMN public.paige_llm_cost_ledger.scope IS
  '''tenant'' = attributable and passthrough-billable. ''platform'' = VERIFIED platform/system scope, '
  'set only when the call site declared scope:''platform''. ''unattributed'' = no tenant and no '
  'declaration — provenance unknown. As of this migration essentially every tenant-less trace on '
  'prod lands as unattributed, because 190 of 217 are calls whose caller simply never threaded a '
  'context. Never report unattributed rows as platform spend.';
COMMENT ON COLUMN public.paige_llm_cost_ledger.wholesale_cost_usd IS
  '[C7] NULL means the price is UNKNOWN (unpriced model, or pricing_version not threaded). Never '
  'defaulted to 0, so a SUM cannot silently understate spend. Report a total beside a count of NULLs.';

ALTER TABLE public.paige_llm_cost_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paige_llm_cost_ledger_operator_read ON public.paige_llm_cost_ledger;
CREATE POLICY paige_llm_cost_ledger_operator_read ON public.paige_llm_cost_ledger
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

DROP POLICY IF EXISTS paige_llm_cost_ledger_service_write ON public.paige_llm_cost_ledger;
CREATE POLICY paige_llm_cost_ledger_service_write ON public.paige_llm_cost_ledger
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── [5b] THE TENANT-VISIBLE SURFACE CARRIES NO PRICE AT ALL ────────────────────────────────
--
-- OWNER CORRECTION 2026-08-24, verbatim: "Do not expose wholesale_cost_usd = 0 to tenants as a
-- placeholder. A comment or metadata flag does not stop downstream sums from treating it as a real
-- zero. Tenant access must go through a safe usage surface that omits wholesale-cost fields
-- entirely." He was right, and a consumer audit found the mechanism is worse than a corrupted sum:
--
--   src/hooks/analytics/useOperatorPlatformMetrics.ts sums this column fleet-wide (:122) and sets
--   `wholesaleAvailable: meteredRows.length > 0` (:129) — availability keyed on ROW COUNT, never on
--   whether a cost is present. PlatformFinancialsSection.tsx renders `wholesaleAvailable ? $x : "—"`
--   (:69) and, only while NOT available, an EmptyState promising "No fabricated margin is shown
--   until then" (:74-79). So a zero-cost row would have printed $0.00 as a real fleet-wide COGS
--   figure AND deleted the honesty guard in the same motion. On the God-tier surface (§57).
--
-- The audit (verified on prod, not inferred) also established the blast radius: the table holds 0
-- rows of ANY category; no view, matview, rule, publication, cron job, inbound FK, edge function,
-- script or GitHub Action reads it; the ONLY application reader is the operator hook above, and it
-- rides the is_platform_owner branch of the policy, not the tenant branch.

-- (1) THE PLACEHOLDER ZERO IS DELETED, NOT HIDDEN. Dropping the DEFAULT is the load-bearing half:
--     an omitting writer must get NULL ("not recorded here"), never a confident 0. Safe today —
--     0 rows, and none of the three CHECK constraints references this column.
ALTER TABLE public.platform_metered_events
  ALTER COLUMN wholesale_cost_usd DROP NOT NULL,
  ALTER COLUMN wholesale_cost_usd DROP DEFAULT;

COMMENT ON COLUMN public.platform_metered_events.wholesale_cost_usd IS
  'Buy-side cost, operator-only. NULL means NOT RECORDED HERE — never "free". For '
  'service_category = ''ai_inference'' the authoritative figure lives in paige_llm_cost_ledger, '
  'keyed by the same trace; read it through v_llm_spend_rollup. Any SUM of this column must '
  'report its NULL count beside the total (v_llm_spend_rollup shows the pattern).';

-- (2) THE TWO LEDGERS CAN NEVER OVERLAP — enforced by Postgres, not by a test nobody runs.
--     Without this, the next person to build the gross-margin surface reasonably sums BOTH
--     paige_llm_cost_ledger and this column and gets double the COGS, with each number individually
--     correct and no test failing. That is the §57 divergence class arriving through addition.
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT IF EXISTS pme_ai_inference_has_no_price;
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_ai_inference_has_no_price
  CHECK (service_category <> 'ai_inference' OR wholesale_cost_usd IS NULL);

-- (3) THE RAW COST-BEARING SHAPE BECOMES OPERATOR-ONLY.
--     The dropped policy was `USING ((tenant_id = current_user_tenant_id()) OR is_platform_owner(...))`.
--     NOTE, and this is the hardest constraint on the whole reshape: the operator connects as the
--     Postgres role `authenticated` — there is no separate operator DB role. So a blanket
--     `REVOKE SELECT ... FROM authenticated`, or a column-level REVOKE on wholesale_cost_usd, would
--     break the operator's own COGS read. Narrowing the POLICY is the only move that separates them.
DROP POLICY IF EXISTS "tenants read own metered events" ON public.platform_metered_events;

-- An explicit read policy, even though the pre-existing FOR ALL operator policy already covers
-- SELECT: it states the intent, so a future edit of the ALL policy cannot silently kill the
-- operator COGS read. is_platform_owner here is deliberate parity with the policy just dropped.
DROP POLICY IF EXISTS "platform owners read metered events" ON public.platform_metered_events;
CREATE POLICY "platform owners read metered events"
  ON public.platform_metered_events
  FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

-- anon holds full CRUD on this table today, inert ONLY because no policy names it. Policy absence
-- is not a guard. Revoke outright, and drop the write grants authenticated never uses — every
-- writer is service_role or the trigger. REFERENCES and TRIGGER go too; a partial revoke that
-- leaves them is the kind of "cleaned up" that isn't.
REVOKE ALL ON TABLE public.platform_metered_events FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.platform_metered_events FROM authenticated;
GRANT  SELECT ON TABLE public.platform_metered_events TO authenticated;  -- RLS restricts it, not this grant
GRANT  ALL    ON TABLE public.platform_metered_events TO service_role;

-- (4) THE TENANT-SAFE SURFACE. What is ABSENT is the contract, so it is listed:
--   wholesale_cost_usd, tenant_retail_charge_usd — the money facts. Never projected.
--   metadata (raw jsonb) — an unbounded future leak; a later writer adding a cost key would be
--                          exposed silently. The token classes are re-projected explicitly instead.
--   provider, model, capability — not a rate by division, but a rate by LOOKUP: model identity plus
--                          token counts plus a public price list recovers our buy rate closely.
--   layer, subject_type, idempotency_key, reconciliation_id — internal taxonomy and join keys.
-- security_invoker is OFF deliberately: the base table is now operator-only, so an invoker view
-- would return zero rows for every tenant by design. Scope is enforced IN-BODY by the predicate
-- below (§59: the grant is never the guard), and the projection carries no money column at all.
-- security-invoker-exempt: tenant usage projection over an operator-only base table; scope enforced in-body, no cost column projected
CREATE OR REPLACE VIEW public.v_tenant_metered_usage
WITH (security_invoker = off) AS
SELECT
  m.id,
  m.tenant_id,
  m.end_customer_user_id,
  m.end_customer_contact_id,
  m.service_category,                                    -- WHAT was consumed ('ai_inference' | 'sms' | …)
  m.event_type,
  m.quantity,                                            -- informational total units; never rate-multiplied
  m.metadata -> 'token_classes'        AS token_classes,  -- per-class counts, no money
  m.metadata ->> 'quantity_semantics'  AS quantity_semantics,
  m.occurred_at
FROM public.platform_metered_events m
WHERE m.tenant_id IS NOT NULL
  AND (
        m.tenant_id = public.current_user_tenant_id()
        OR public.is_platform_owner(auth.uid())
      );

COMMENT ON VIEW public.v_tenant_metered_usage IS
  'The ONLY tenant-readable projection of platform_metered_events. Carries usage quantities and '
  'nothing priced: no wholesale cost, no retail charge, no raw metadata, no provider or model. A '
  'tenant can see WHAT it consumed and cannot recover what it cost us THROUGH THIS VIEW. That '
  'scoping is deliberate and must not be widened into a claim about the platform: '
  'paige_llm_trace.cost_estimate_usd is separately tenant-readable today under '
  'paige_llm_trace_tenant_read, and closing that is a sequenced follow-up requiring its own §37 '
  'inventory of every tenant-side reader (ReasoningPanel / §34 L1 / L7). Because security_invoker '
  'is off, the WHERE clause above is the ONLY thing separating one tenant from another — adding a '
  'column or loosening that predicate is a security change, not a display change.';

REVOKE ALL  ON public.v_tenant_metered_usage FROM PUBLIC, anon;
GRANT SELECT ON public.v_tenant_metered_usage TO authenticated, service_role;

-- ─── STEP 2 · THE METER BRIDGE ───────────────────────────────────────────────────────────────
--
-- [C2] FAIL-CLOSED = TRANSACTIONAL CONSISTENCY BETWEEN TRACE AND LEDGER. IT IS NOT BILLING
-- DURABILITY, AND THIS COMMENT MUST NOT BE READ AS CLAIMING IT IS.
--
-- The previous version ended in `EXCEPTION WHEN OTHERS THEN RAISE WARNING ...; RETURN NEW;`. That
-- let a trace COMMIT while its meter event did not, and then called itself atomic. It was not.
--
-- Removing that handler buys exactly one property, stated precisely: a trace and its ledger rows now
-- commit together or not at all, so the database can never hold a trace whose usage was never
-- costed. That is consistency BETWEEN THE RECORDS.
--
-- WHAT IT DOES NOT BUY, and the reason budget enforcement and autonomy widening stay blocked:
-- the caller does not await this write. traceLLMCall() fires the insert through
-- EdgeRuntime.waitUntil with its own try/catch and never rethrows (llm-trace.ts:270-289). So on a
-- failure here BOTH records disappear while the model call already happened and the user's
-- generation already succeeded. Provider spend occurred and nothing recorded it. Failing closed
-- makes that loss CONSISTENT and LOUD (the caller's catch logs; the trace count flatlines, which is
-- trivially alertable) — but the usage is still gone. Guaranteed capture needs a durable outbox or
-- an equivalent mechanism that survives isolate teardown, and until that exists no budget ceiling
-- built on this data is enforceable. That is a prerequisite for Step 5, not an optional polish.
--
-- [C4] SECURITY INVOKER, not DEFINER. The only role that can INSERT into paige_llm_trace is
-- service_role (policy in 20260719150000), which also holds INSERT on both destinations, so
-- elevation buys nothing and a DEFINER trigger would silently write as postgres. COUPLING TO WATCH:
-- if a future migration grants another role INSERT on paige_llm_trace, that role must also be
-- granted INSERT on platform_metered_events and paige_llm_cost_ledger, or its traces will fail
-- closed. Loud by design; named here so it is diagnosed in seconds rather than hours.
CREATE OR REPLACE FUNCTION public.meter_llm_trace() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  _billable_tokens bigint;
  _cost            numeric;
  _cost_is_est     boolean;
  _cost_source     text;
  _registry_cost   numeric;
  _scope           text;
  _classes         jsonb;
BEGIN
  _billable_tokens := public.llm_trace_billable_tokens(
    NEW.tokens_in, NEW.tokens_in_uncached, NEW.tokens_cache_read,
    NEW.tokens_cache_write_5m, NEW.tokens_cache_write_1h, NEW.tokens_out);

  IF NOT public.llm_trace_is_billable(
       NEW.tokens_in, NEW.tokens_in_uncached, NEW.tokens_cache_read,
       NEW.tokens_cache_write_5m, NEW.tokens_cache_write_1h, NEW.tokens_out,
       NEW.billable_units) THEN
    RETURN NEW;   -- consumed nothing billable. Same predicate the detectors use ([C3]).
  END IF;

  -- [C6] Owner boundary 2 — the scope is DECIDED, never guessed.
  --   A tenant is present            → 'tenant'.
  --   No tenant, caller DECLARED it  → 'platform'  (metadata.scope = 'platform', set server-side).
  --   No tenant, no declaration      → 'unattributed'.
  -- Inferring 'platform' from the mere presence of some correlation id would relabel a dropped
  -- attribution as internal burn, which is precisely the silent misclassification to avoid.
  _scope := CASE
              WHEN NEW.tenant_id IS NOT NULL THEN 'tenant'
              WHEN COALESCE(NEW.metadata->>'scope', '') = 'platform' THEN 'platform'
              ELSE 'unattributed'
            END;

  -- ── COST PRECEDENCE ([C1], owner ruling 2026-08-24) ───────────────────────────────────────
  -- An earlier draft of this function put NEW.cost_estimate_usd AHEAD of the registry estimator.
  -- That was wrong, and wrong in the direction that costs money to believe: cost_estimate_usd is
  -- written by _shared/model-router.ts at ITS OWN legacy Anthropic rates ($3/$15 per MTok), so
  -- every Anthropic row would have been banked at ~50% above the $2/$10 rates THIS MIGRATION
  -- seeds and declares authoritative. The ledger would have contradicted its own price table,
  -- with no column able to tell you which rate any given row used.
  --
  -- The order is now: invoice > authoritative registry > legacy estimate, and each branch RECORDS
  -- which one it took. The legacy branch is a deliberate, labelled fallback, never a silent one —
  -- the owner's rule is that a legacy figure must stay visibly distinguishable rather than be
  -- relabelled as registry-priced merely to avoid a NULL.
  --
  -- Why the legacy branch still exists at all: estimate_llm_cost_usd() returns NULL unless
  -- model_provider AND model AND pricing_version are all present and matched in paige_model_pricing.
  -- Today's DEPLOYED writer sets none of model_provider/pricing_version, so for every row written
  -- before the edge-function half of this PR ships, the registry CANNOT price the call. Dropping
  -- the legacy value there would discard the only cost signal those rows have; keeping it unlabelled
  -- would launder a legacy rate as an authoritative one. Labelling it is the honest third option.
  _registry_cost := public.estimate_llm_cost_usd(
    NEW.model_provider, NEW.model, NEW.pricing_version,
    COALESCE(NEW.tokens_in_uncached, NEW.tokens_in), NEW.tokens_cache_read,
    NEW.tokens_cache_write_5m, NEW.tokens_cache_write_1h, NEW.tokens_out);

  IF NEW.cost_actual_usd IS NOT NULL THEN
    _cost := NEW.cost_actual_usd;      _cost_source := 'actual';
  ELSIF _registry_cost IS NOT NULL THEN
    _cost := _registry_cost;           _cost_source := 'registry';
  ELSIF NEW.cost_estimate_usd IS NOT NULL THEN
    _cost := NEW.cost_estimate_usd;    _cost_source := 'legacy_router_estimate';
  ELSE
    -- Unpriced, and it says so. NULL never becomes a confident zero ([C7]).
    _cost := NULL;                     _cost_source := NULL;
  END IF;

  -- 'estimate' means "not an invoice-confirmed figure" — true for BOTH estimate sources.
  _cost_is_est := NEW.cost_actual_usd IS NULL;

  -- ── (1) THE COST LEDGER — every scope, operator-only, money lives here and only here.
  INSERT INTO public.paige_llm_cost_ledger (
    trace_id, occurred_at, scope, tenant_id,
    model_provider, model, gateway_provider, billing_provider, pricing_version,
    capability, job_kind, tier, status, request_id, attempt, is_retry, is_fallback,
    tokens_in_uncached, tokens_cache_read, tokens_cache_write_5m, tokens_cache_write_1h,
    tokens_out, tokens_reasoning, billable_tokens_total, billable_units,
    wholesale_cost_usd, cost_is_estimate, cost_source
  ) VALUES (
    NEW.id, NEW.created_at, _scope, NEW.tenant_id,
    NEW.model_provider, NEW.model, NEW.gateway_provider,
    COALESCE(NEW.billing_provider, NEW.model_provider, NEW.provider), NEW.pricing_version,
    NEW.capability, NEW.job_kind, NEW.tier, NEW.status,
    NEW.request_id, NEW.attempt, NEW.is_retry, NEW.is_fallback,
    COALESCE(NEW.tokens_in_uncached, NEW.tokens_in), NEW.tokens_cache_read,
    NEW.tokens_cache_write_5m, NEW.tokens_cache_write_1h,
    NEW.tokens_out, NEW.tokens_reasoning, _billable_tokens,
    COALESCE(NEW.billable_units, '{}'::jsonb),
    _cost, _cost_is_est, _cost_source
  )
  ON CONFLICT (trace_id) DO NOTHING;

  -- ── (2) TENANT-VISIBLE USAGE — only when there is a tenant, and deliberately PRICELESS.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;   -- nobody to show usage to; the ledger row above is the whole record.
  END IF;

  -- [C7] The per-class breakdown. Tenants may see WHAT they consumed. They may not see what it cost
  -- us, in any form a rate can be recovered from.
  _classes := jsonb_strip_nulls(jsonb_build_object(
    'tokens_in_uncached',    COALESCE(NEW.tokens_in_uncached, NEW.tokens_in),
    'tokens_cache_read',     NEW.tokens_cache_read,
    'tokens_cache_write_5m', NEW.tokens_cache_write_5m,
    'tokens_cache_write_1h', NEW.tokens_cache_write_1h,
    'tokens_out',            NEW.tokens_out,
    'tokens_reasoning',      NEW.tokens_reasoning,   -- diagnostic; not billed, not summed
    'billable_units',        NULLIF(NEW.billable_units, '{}'::jsonb)));

  INSERT INTO public.platform_metered_events (
    tenant_id, service_category, event_type, provider, quantity,
    wholesale_cost_usd, tenant_retail_charge_usd,
    layer, subject_type, subject_id, idempotency_key, occurred_at, metadata
  ) VALUES (
    NEW.tenant_id,
    'ai_inference',
    COALESCE(NEW.job_kind, 'llm_call'),
    COALESCE(NEW.billing_provider, NEW.model_provider, NEW.provider),
    _billable_tokens,
    -- NULL = NOT RECORDED HERE. Never 0, which would read as "this call was free".
    -- [5b, owner correction 2026-08-24] This was a literal 0, defended by a comment and a
    -- metadata flag. The owner's ruling — "a comment or metadata flag does not stop downstream
    -- sums from treating it as a real zero" — is demonstrably right, and the consumer audit found
    -- the exact mechanism: useOperatorPlatformMetrics.ts sums this column fleet-wide and keys its
    -- availability flag on ROW COUNT, not on cost presence. A zero-cost row would have flipped the
    -- operator's "Metered COGS" tile from an honest em dash to an asserted $0.00 AND removed the
    -- EmptyState that promises "No fabricated margin is shown until then". The column is now
    -- nullable with no default precisely so this row does not have to claim a price at all.
    -- The authoritative figure for this trace is in paige_llm_cost_ledger, keyed by the same id.
    NULL,
    NULL,                       -- retail is a pricing decision, not a cost fact. Deliberately unset.
    'L3_tenant_passthrough',
    'tenant',
    NEW.tenant_id,
    'llm_trace:' || NEW.id::text,
    NEW.created_at,
    jsonb_strip_nulls(jsonb_build_object(
      'trace_id',            NEW.id,
      'request_id',          NEW.request_id,
      'provider_request_id', NEW.provider_request_id,
      'attempt',             NEW.attempt,
      'is_retry',            NEW.is_retry,
      'is_fallback',         NEW.is_fallback,
      'status',              NEW.status,
      'model',               NEW.model,
      'capability',          NEW.capability,
      'token_classes',       _classes,
      'quantity_semantics',  'informational_total_tokens',
      'cost_recorded_in',    'paige_llm_cost_ledger',
      'run_id',              NEW.run_id,
      'workflow_id',         NEW.workflow_id,
      'conversation_id',     NEW.conversation_id,
      'task_id',             NEW.task_id,
      'agent_id',            NEW.agent_id
    ))
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
  -- NO EXCEPTION HANDLER, deliberately — see the [C2] note above.
END; $$;

DROP TRIGGER IF EXISTS trg_meter_llm_trace ON public.paige_llm_trace;
CREATE TRIGGER trg_meter_llm_trace
  AFTER INSERT ON public.paige_llm_trace
  FOR EACH ROW EXECUTE FUNCTION public.meter_llm_trace();

COMMENT ON FUNCTION public.meter_llm_trace() IS
  'Step 2 bridge. Every billable trace produces exactly one paige_llm_cost_ledger row (operator-only, '
  'carries the money) and, when a tenant is attributable, exactly one platform_metered_events row '
  '(tenant-visible, carries usage and NO price). Scope is decided, never inferred: tenant / verified '
  'platform (declared via metadata.scope) / unattributed. Idempotent on both sides. Fails CLOSED — '
  'no exception handler, so a ledger failure rolls the trace back with it. That is transactional '
  'consistency, NOT billing durability: the caller does not await this write ([C2]).';

-- ─── RECONCILIATION SURFACES ─────────────────────────────────────────────────────────────────
--
-- All views are security_invoker so RLS applies to the reader (#116 — a security_definer view here
-- would hand every tenant's usage to any caller). All are GRANTed at the foot of this file:
-- security_invoker changes WHOSE RLS applies, it never waives the need to hold SELECT on the view.
--
-- NOTE ON EXPOSURE: this file creates FIVE views, and FOUR of the five read paige_llm_cost_ledger,
-- whose RLS is operator-only, so a tenant selecting from them gets zero rows rather than a filtered
-- price. The exception is v_llm_trace_unmetered, which reads platform_metered_events instead.
-- (This comment previously said "three of the four", which was wrong on BOTH counts — corrected
-- 2026-08-24 after the owner caught the view count. Counted, not remembered: the five CREATE OR
-- REPLACE VIEW statements below, and a per-view check of which reference the ledger.)

-- [C3] The activation marker. The meter trigger is AFTER INSERT and this migration performs no
-- backfill, so every trace that already existed is permanently uncosted. Without this bound the
-- detectors below would be born reporting 213 rows on prod and would be crying wolf from their
-- first query — a detector whose "expected empty" is never empty teaches everyone to ignore it.
-- The marker is RECORDED, not guessed. An earlier draft hardcoded a date literal and the proof
-- immediately caught why that is wrong: any real trace written between midnight and the moment the
-- migration lands falls inside the window with no ledger row, so the detector opens reporting
-- failures that are not failures. `now()` at apply time is the only value that is exactly right,
-- and it is self-recording — a re-apply cannot silently move it, because the INSERT is guarded.
CREATE TABLE IF NOT EXISTS public.paige_llm_meter_bridge (
  singleton   boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  active_from timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.paige_llm_meter_bridge (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

-- [C4 / owner correction 2026-08-24] This table shipped in `public` with NO row-level security and a
-- blanket SELECT grant to `authenticated`, on the stated reasoning that an activation instant "is not
-- sensitive". That reasoning was wrong on principle, and the owner caught it: a tenant-readable table
-- sitting in `public` with RLS off is a standing exception somebody has to keep re-justifying, and
-- BOTH sibling tables in this same file already carry RLS. It now matches them exactly — operators
-- read, service writes, tenants get zero rows. The SELECT grant is retained deliberately: the POLICY,
-- not the absence of a grant, is what restricts this, which is the same shape used above.
ALTER TABLE public.paige_llm_meter_bridge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paige_llm_meter_bridge_operator_read ON public.paige_llm_meter_bridge;
CREATE POLICY paige_llm_meter_bridge_operator_read ON public.paige_llm_meter_bridge
  FOR SELECT TO authenticated
  USING (public.is_platform_operator());

DROP POLICY IF EXISTS paige_llm_meter_bridge_service_write ON public.paige_llm_meter_bridge;
CREATE POLICY paige_llm_meter_bridge_service_write ON public.paige_llm_meter_bridge
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- SECURITY DEFINER, deliberately — and this is the ONLY definer function in this migration.
-- Enabling RLS immediately above would otherwise BREAK the two detector views: they are
-- security_invoker, they call this function inside their WHERE clause, and a non-operator caller
-- would now read zero rows from the single-row table. The function would return NULL, the predicate
-- `created_at >= NULL` would go NULL, and the views would quietly return nothing instead of erroring
-- — a silent wrong answer, which is worse than a loud failure. Definer keeps the boundary correct
-- for every caller while the table itself stays operator-only.
-- Safe by the §59 class-A test: it takes NO PARAMETERS (there is no id to tamper with, so no IDOR
-- surface can exist), it returns exactly one non-sensitive scalar and can return nothing else, and
-- search_path is pinned empty with the object fully qualified.
CREATE OR REPLACE FUNCTION public.llm_meter_bridge_active_from() RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$ SELECT active_from FROM public.paige_llm_meter_bridge WHERE singleton $$;

COMMENT ON TABLE public.paige_llm_meter_bridge IS
  'One row, recording the instant the meter bridge began covering new traces. Exists so the '
  'detectors have an exact boundary instead of a hardcoded date that is wrong by however long '
  'passed between midnight and the migration landing.';
COMMENT ON FUNCTION public.llm_meter_bridge_active_from() IS
  'The instant the meter bridge began covering new traces. Rows older than this were never eligible '
  '(the trigger is AFTER INSERT and nothing was backfilled), so the detectors exclude them rather '
  'than reporting a permanent backlog as a live failure.';

-- DETECTOR 1 — every billable trace must have a cost-ledger row, whatever its scope.
-- [C3] The eligibility predicate is llm_trace_is_billable() — the SAME function the trigger calls.
-- The previous version hand-rolled `uncached + out > 0`, which missed a trace that consumed only
-- cache reads or only billable_units: billable to the trigger, invisible to the detector.
CREATE OR REPLACE VIEW public.v_llm_trace_uncosted
WITH (security_invoker = on) AS
SELECT t.id AS trace_id, t.tenant_id, t.created_at, t.model, t.model_provider, t.status,
       public.llm_trace_billable_tokens(
         t.tokens_in, t.tokens_in_uncached, t.tokens_cache_read,
         t.tokens_cache_write_5m, t.tokens_cache_write_1h, t.tokens_out) AS billable_tokens,
       t.billable_units
  FROM public.paige_llm_trace t
  LEFT JOIN public.paige_llm_cost_ledger c ON c.trace_id = t.id
 -- [5b] OPERATOR-ONLY, and this is a CORRECTNESS gate, not just an access one. The view is
 -- security_invoker, paige_llm_trace HAS a tenant-read policy, and paige_llm_cost_ledger's RLS is
 -- operator-only — so WITHOUT this line a tenant reading it sees 100% of their own billable traces
 -- reported as "uncosted", because the ledger side of the LEFT JOIN is invisible to them. That is
 -- not an error a caller can notice; it is a confident wrong answer. Empty beats wrong.
 WHERE public.is_platform_operator()
   AND t.created_at >= public.llm_meter_bridge_active_from()
   AND c.id IS NULL
   AND public.llm_trace_is_billable(
         t.tokens_in, t.tokens_in_uncached, t.tokens_cache_read,
         t.tokens_cache_write_5m, t.tokens_cache_write_1h, t.tokens_out, t.billable_units);

COMMENT ON VIEW public.v_llm_trace_uncosted IS
  'Traces that consumed billable provider resources on or after bridge activation and reached no '
  'cost-ledger row. Expected to be EMPTY. Shares llm_trace_is_billable() with the trigger so the '
  'two can never disagree about eligibility ([C3]).';

-- DETECTOR 2 — every billable TENANT trace must also have its tenant-visible usage event.
CREATE OR REPLACE VIEW public.v_llm_trace_unmetered
WITH (security_invoker = on) AS
SELECT t.id AS trace_id, t.tenant_id, t.created_at, t.model, t.status,
       public.llm_trace_billable_tokens(
         t.tokens_in, t.tokens_in_uncached, t.tokens_cache_read,
         t.tokens_cache_write_5m, t.tokens_cache_write_1h, t.tokens_out) AS billable_tokens
  FROM public.paige_llm_trace t
  LEFT JOIN public.platform_metered_events m
         ON m.idempotency_key = 'llm_trace:' || t.id::text
 -- [5b] Same gate, same reason, and here the revoke above makes it mandatory: platform_metered_events
 -- is now operator-only, so a tenant reading this view would see EVERY one of their own traces
 -- reported as "unmetered" — the metered side of the join simply invisible to them. Empty beats wrong.
 WHERE public.is_platform_operator()
   AND t.tenant_id IS NOT NULL
   AND t.created_at >= public.llm_meter_bridge_active_from()
   AND m.id IS NULL
   AND public.llm_trace_is_billable(
         t.tokens_in, t.tokens_in_uncached, t.tokens_cache_read,
         t.tokens_cache_write_5m, t.tokens_cache_write_1h, t.tokens_out, t.billable_units);

COMMENT ON VIEW public.v_llm_trace_unmetered IS
  'Tenant-scoped billable traces with no tenant-visible usage event. Expected to be EMPTY.';

-- DETECTOR 3 — [C6] owner boundary 2: "Add an alert/reconciliation category for any future
-- unattributed provider call." Every row here is a call site that spent real money and did not say
-- on whose behalf. Expected to trend to zero as the identified callers are repaired; it is a
-- WORKLIST, not a health check, and it is deliberately separate from the two detectors above so a
-- known attribution backlog can never mask a live bridge failure.
CREATE OR REPLACE VIEW public.v_llm_unattributed_spend
WITH (security_invoker = on) AS
SELECT date_trunc('day', c.occurred_at)                      AS day,
       c.job_kind,
       c.model,
       c.model_provider,
       count(*)                                              AS calls,
       sum(c.billable_tokens_total)                          AS billable_tokens,
       count(*) FILTER (WHERE c.wholesale_cost_usd IS NULL)   AS calls_price_unknown,
       sum(c.wholesale_cost_usd) FILTER (WHERE c.wholesale_cost_usd IS NOT NULL) AS known_cost_usd
  FROM public.paige_llm_cost_ledger c
 WHERE c.scope = 'unattributed'
 GROUP BY 1, 2, 3, 4;

COMMENT ON VIEW public.v_llm_unattributed_spend IS
  '[C6] Provider spend with no tenant and no declared platform scope — calls whose attribution was '
  'dropped at the call site. Alert on any non-zero day. NOT platform usage: do not fold these into '
  'a platform-burn figure, and do not charge them to a tenant. Each row is a caller to repair.';

-- Each cost row beside the trace that produced it and the tenant-visible event it generated, with
-- the estimate/actual and known/unknown distinctions preserved as columns rather than flattened.
CREATE OR REPLACE VIEW public.v_llm_usage_reconciliation
WITH (security_invoker = on) AS
SELECT
  c.id                  AS cost_row_id,
  c.trace_id,
  c.scope,
  c.tenant_id,
  c.occurred_at,
  -- [C7] NAMED FOR WHAT IT IS. billable_tokens_total sums differently-priced classes, so it is an
  -- informational total and must never have a single rate applied to it. The authoritative figures
  -- are the per-class columns and wholesale_cost_usd (already summed at the right rates).
  c.billable_tokens_total AS informational_total_tokens,
  c.tokens_in_uncached, c.tokens_cache_read, c.tokens_cache_write_5m, c.tokens_cache_write_1h,
  c.tokens_out,
  c.tokens_reasoning,     -- diagnostic subset of tokens_out; never billed
  c.billable_units,
  c.wholesale_cost_usd,
  -- [C1-precedence] Which rate basis produced wholesale_cost_usd: 'actual' | 'registry' |
  -- 'legacy_router_estimate'. Surfaced so an operator summing this view can SEE that a subtotal
  -- mixes authoritative registry prices with legacy router estimates, instead of having to know.
  c.cost_source,
  (c.cost_source = 'legacy_router_estimate') AS cost_is_legacy_rate,
  (c.wholesale_cost_usd IS NOT NULL) AS cost_known,
  c.cost_is_estimate,
  c.model, c.model_provider, c.gateway_provider, c.billing_provider, c.pricing_version,
  c.capability, c.job_kind, c.tier, c.status AS call_status,
  c.request_id, c.attempt, c.is_retry, c.is_fallback,
  t.provider_request_id,
  t.cost_estimate_usd,
  t.cost_actual_usd,
  t.reconciled_at,
  m.id                  AS meter_event_id,
  m.idempotency_key
FROM public.paige_llm_cost_ledger c
LEFT JOIN public.paige_llm_trace t ON t.id = c.trace_id
LEFT JOIN public.platform_metered_events m
       ON m.idempotency_key = 'llm_trace:' || c.trace_id::text;

COMMENT ON VIEW public.v_llm_usage_reconciliation IS
  'Cost row beside its trace and its tenant-visible usage event. informational_total_tokens is named '
  'so no reader applies one rate to a sum of differently-priced classes; the per-class columns and '
  'wholesale_cost_usd are authoritative. cost_known and cost_is_estimate are first-class so an '
  'absent price is never read as an invoice-confirmed zero ([C7]). Operator-scoped by the ledger''s '
  'own RLS.';

-- [C7] The one safe way to total spend: known and unknown reported side by side, never blended.
CREATE OR REPLACE VIEW public.v_llm_spend_rollup
WITH (security_invoker = on) AS
SELECT
  c.scope                                                                   AS ledger,
  date_trunc('day', c.occurred_at)                                          AS day,
  count(*)                                                                  AS calls,
  count(*) FILTER (WHERE c.wholesale_cost_usd IS NULL)                       AS calls_price_unknown,
  sum(c.wholesale_cost_usd) FILTER (WHERE c.wholesale_cost_usd IS NOT NULL)  AS known_cost_usd,
  -- [C1-precedence] known_cost_usd can MIX rate bases: an authoritative registry price and a legacy
  -- router estimate at different rates add up to a number that is not wrong so much as unlabelled.
  -- These three make the mix visible in the same row as the total, on the same principle as
  -- calls_price_unknown — a subtotal must carry the caveat that qualifies it, not leave it to a
  -- reader who would have to already know to go looking.
  count(*) FILTER (WHERE c.cost_source = 'registry')                          AS calls_priced_registry,
  count(*) FILTER (WHERE c.cost_source = 'legacy_router_estimate')            AS calls_priced_legacy_rate,
  sum(c.wholesale_cost_usd) FILTER (WHERE c.cost_source = 'legacy_router_estimate') AS legacy_rate_cost_usd,
  sum(c.billable_tokens_total)                                              AS informational_total_tokens
FROM public.paige_llm_cost_ledger c
GROUP BY 1, 2;

COMMENT ON VIEW public.v_llm_spend_rollup IS
  '[C7] Daily wholesale spend by scope — tenant, platform, unattributed. known_cost_usd sums ONLY '
  'rows whose price is known and calls_price_unknown counts the rest, so a total can never quietly '
  'understate spend by treating an absent price as zero. Read the two together or not at all. '
  'Operator-scoped by the ledger''s RLS — this is the operator COGS surface, and the reason '
  'platform_metered_events no longer carries a price. calls_priced_legacy_rate and '
  'legacy_rate_cost_usd expose how much of known_cost_usd came from the pre-registry router '
  'estimate rather than the authoritative rate table — a total that mixes rate bases must say so.';

-- ─── INVOICE RECONCILIATION ──────────────────────────────────────────────────────────────────
-- When a provider invoice later confirms a real cost, updating the trace propagates to the ledger.
-- Only cost_actual_usd flows through; an estimate never overwrites a confirmed figure, and the
-- row's identity and quantities are immutable. Nothing propagates to platform_metered_events — that
-- row carries no price to correct ([C3-boundary]).
--
-- [C2] Also fails closed, and for the same reason: a reconciliation that silently failed to land
-- would leave the ledger asserting an estimate while the trace claims a confirmed figure — two
-- records disagreeing about money, with a warning nobody reads as the only sign of it.
CREATE OR REPLACE FUNCTION public.reconcile_llm_trace_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.cost_actual_usd IS NULL
     OR NEW.cost_actual_usd IS NOT DISTINCT FROM OLD.cost_actual_usd THEN
    RETURN NEW;
  END IF;

  UPDATE public.paige_llm_cost_ledger
     SET wholesale_cost_usd = NEW.cost_actual_usd,
         cost_is_estimate   = false
   WHERE trace_id = NEW.id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reconcile_llm_trace_cost ON public.paige_llm_trace;
CREATE TRIGGER trg_reconcile_llm_trace_cost
  AFTER UPDATE OF cost_actual_usd ON public.paige_llm_trace
  FOR EACH ROW EXECUTE FUNCTION public.reconcile_llm_trace_cost();

COMMENT ON FUNCTION public.reconcile_llm_trace_cost() IS
  'Propagates an invoice-confirmed cost onto its cost-ledger row and flips cost_is_estimate false. '
  'Quantities and identity are never rewritten. Fails closed ([C2]).';

-- ─── [C4] PRIVILEGES ─────────────────────────────────────────────────────────────────────────
--
-- The previous version of this migration contained ZERO GRANT and ZERO REVOKE statements. Two real
-- consequences, both verified live rather than theorised:
--   · estimate_llm_cost_usd inherited Postgres's default PUBLIC EXECUTE and was anon-callable, and
--     as SECURITY DEFINER it read the wholesale price list this file exists to protect.
--   · paige_model_pricing and the views got RLS/security_invoker but no table privilege, so the
--     operator-read policy could never fire — the surfaces were unreachable by the very role they
--     were written for.
-- Note for whoever tunes the CI guard: scripts/ci/definer-fn-lint.mjs only flags an EXPLICIT
-- `GRANT EXECUTE ... TO anon|public`, so a migration that writes no GRANT at all passes the lint
-- while still carrying the default PUBLIC grant. Writing nothing is not the safe default.

-- Functions: nothing here is a public API. Revoke the default, then grant only real callers.
REVOKE ALL ON FUNCTION public.estimate_llm_cost_usd(text,text,text,int,int,int,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meter_llm_trace()                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_llm_trace_cost()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.llm_meter_bridge_active_from()                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.llm_trace_billable_tokens(integer,integer,integer,integer,integer,integer)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.llm_trace_is_billable(integer,integer,integer,integer,integer,integer,jsonb)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.estimate_llm_cost_usd(text,text,text,int,int,int,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.meter_llm_trace()                                          TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_llm_trace_cost()                                 TO service_role;
-- The two eligibility helpers are pure arithmetic over values the caller already passes in — they
-- read no table and leak nothing. The activation marker is DIFFERENT and this comment used to lump
-- it in with them, which was simply untrue: it reads public.paige_llm_meter_bridge. It is now
-- SECURITY DEFINER over an operator-only table, justified at its definition. All three are called by
-- the invoker views, so authenticated needs EXECUTE for those views to be readable at all.
GRANT EXECUTE ON FUNCTION public.llm_trace_billable_tokens(integer,integer,integer,integer,integer,integer)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.llm_trace_is_billable(integer,integer,integer,integer,integer,integer,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.llm_meter_bridge_active_from()                                                TO authenticated, service_role;

-- Tables: SELECT to authenticated is what lets the operator-read RLS policy fire at all; the policy,
-- not the grant, is what restricts it to operators. anon gets nothing.
REVOKE ALL ON TABLE public.paige_model_pricing     FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.paige_llm_cost_ledger   FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.paige_llm_meter_bridge  FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.paige_model_pricing    TO authenticated;
GRANT SELECT ON TABLE public.paige_llm_cost_ledger  TO authenticated;
-- The bridge marker now carries RLS with an operator-only read policy, exactly like the two tables
-- above. This grant does NOT make it tenant-readable — the policy decides that, and a tenant gets
-- zero rows. (The detector views no longer depend on this grant at all: they read the instant
-- through the SECURITY DEFINER accessor, which is why enabling RLS here does not break them.)
GRANT SELECT ON TABLE public.paige_llm_meter_bridge TO authenticated;
GRANT ALL    ON TABLE public.paige_model_pricing    TO service_role;
GRANT ALL    ON TABLE public.paige_llm_cost_ledger  TO service_role;
GRANT ALL    ON TABLE public.paige_llm_meter_bridge TO service_role;

-- Views: security_invoker decides WHOSE RLS applies; it does not waive the SELECT privilege on the
-- view itself. Without these grants every reconciliation surface is unreadable.
REVOKE ALL ON public.v_llm_trace_uncosted        FROM PUBLIC, anon;
REVOKE ALL ON public.v_llm_trace_unmetered       FROM PUBLIC, anon;
REVOKE ALL ON public.v_llm_unattributed_spend    FROM PUBLIC, anon;
REVOKE ALL ON public.v_llm_usage_reconciliation  FROM PUBLIC, anon;
REVOKE ALL ON public.v_llm_spend_rollup          FROM PUBLIC, anon;
GRANT SELECT ON public.v_llm_trace_uncosted       TO authenticated, service_role;
GRANT SELECT ON public.v_llm_trace_unmetered      TO authenticated, service_role;
GRANT SELECT ON public.v_llm_unattributed_spend   TO authenticated, service_role;
GRANT SELECT ON public.v_llm_usage_reconciliation TO authenticated, service_role;
GRANT SELECT ON public.v_llm_spend_rollup         TO authenticated, service_role;

-- ─── OWED FOLLOW-UP, NAMED SO IT IS NOT LOST (§13/§58) ───────────────────────────────────────
-- src/hooks/analytics/useOperatorPlatformMetrics.ts sums platform_metered_events.wholesale_cost_usd
-- fleet-wide as operator COGS. That column is now deliberately 0 for ai_inference rows, so once LLM
-- rows start flowing the operator COGS surface must be repointed at v_llm_spend_rollup or it will
-- under-report. NOTHING REGRESSES TODAY — platform_metered_events holds zero ai_inference rows, so
-- that sum is not currently receiving any LLM cost to lose. The frontend change is deliberately not
-- made here: it is operator-surface UI, which this branch is scoped out of, and Codex holds a
-- parallel operator UI branch. Sequence it before the bridge starts writing in earnest.
