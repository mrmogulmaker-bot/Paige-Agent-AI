-- ─── STEP 1 — THE CANONICAL USAGE TRACE ──────────────────────────────────────────────────────
--
-- Owner brief, 2026-08-24: "Measure and persist complete provider usage." Instrumentation FIRST;
-- no prompt optimization, no routing change, no budget enforcement until the baseline is proven.
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
--  3. CACHING IS NEVER REQUESTED. `grep -rn cache_control supabase/functions/` returns nothing, so
--     today every request is a full-price read. That is the BASELINE these columns must prove before
--     Phase 4 changes anything — a cache-hit column that reads 0 is a measurement, not a defect.
--
--  4. `tokens_in` IS AMBIGUOUS BY CONSTRUCTION. It receives Anthropic's `usage.input_tokens`, which
--     means TOTAL input while caching is off and UNCACHED input the moment caching is switched on —
--     the same column silently changing meaning. That is a trap for any cost series built on it.
--     → tokens_in_uncached is the unambiguous successor. `tokens_in` is retained and frozen as the
--       legacy field so no existing reader breaks and no history is rewritten.
--
--  5. RETRIES AND TOOL-LOOP ITERATIONS ARE NOT SEPARATE ROWS. parent_trace_id is populated on
--     0 of 640 live rows. The router traces a provider error, a Claude fallback and a success from
--     the same call (model-router.ts L873/887/911/921/999) but nothing links them as attempts of one
--     logical request.
--     → request_id groups the attempts of one logical request; attempt numbers them; is_retry and
--       is_fallback say which kind. parent_trace_id is left alone.
--
--  6. THE COST FIGURE ALREADY DECLARES ITS OWN LIMITS. Every costed row carries
--     cost_basis = 'list price, in+out tokens, excl caching/thinking/tool round-trips, 2026-07'.
--     It is an ESTIMATE at list price and it says so.
--     → cost_actual_usd is a SEPARATE column that stays NULL until a provider invoice reconciles it.
--       An estimate is never written into it. pricing_version records which price list produced the
--       estimate, so a repriced model does not silently rewrite history.
--
-- NOT CHANGED BY THIS MIGRATION: no column is dropped, renamed or retyped; no row is rewritten. It
-- is additive only, so rollback is a DROP of the added objects and nothing is lost.

-- ── 1a. Identity, separated ──────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  -- The host we sent the HTTP request TO. Null when we called a vendor directly.
  ADD COLUMN IF NOT EXISTS gateway_provider text,
  -- Who actually ran the model. This is the one that decides which price list applies.
  ADD COLUMN IF NOT EXISTS model_provider text,
  -- Who invoices us for it. Usually the gateway when there is one, else the model provider.
  ADD COLUMN IF NOT EXISTS billing_provider text,
  -- The capability/lane this call served, distinct from job_kind (what) and tier (how strong).
  ADD COLUMN IF NOT EXISTS capability text,
  -- Which price list produced cost_estimate_usd. Never infer a price without one.
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

-- ── 1b. Correlation ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  -- One logical request. Every attempt (retry, fallback) of that request shares it.
  ADD COLUMN IF NOT EXISTS request_id uuid,
  -- The provider's OWN id for the call — the only key a provider invoice can be matched on.
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

-- ── 1c. Complete token accounting ────────────────────────────────────────────────────────────
-- NULL means "the provider did not report it". 0 means "the provider reported zero". Those are
-- different facts and the schema keeps them different — a defaulted 0 would manufacture evidence
-- of a cache hit rate we have not measured.
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS tokens_in_uncached integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_read integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_write_5m integer,
  ADD COLUMN IF NOT EXISTS tokens_cache_write_1h integer,
  ADD COLUMN IF NOT EXISTS tokens_reasoning integer,
  -- Non-token provider charges: tool invocations, web search, audio seconds, image counts.
  -- Shape is {unit: quantity}; the pricing registry decides what each unit costs.
  ADD COLUMN IF NOT EXISTS billable_units jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.paige_llm_trace.tokens_in IS
  'LEGACY. Receives Anthropic usage.input_tokens, which means TOTAL input while caching is off and '
  'UNCACHED input once it is on — the same column changing meaning. Frozen; read tokens_in_uncached.';
COMMENT ON COLUMN public.paige_llm_trace.tokens_cache_read IS
  'Cache-read input tokens, billed at a fraction of the uncached rate. NULL = not reported by the '
  'provider; 0 = reported as zero. As of this migration cache_control is requested nowhere in '
  'supabase/functions, so 0 here is the expected BASELINE, not a fault.';

-- ── 1d. Attempt accounting ───────────────────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS attempt smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.paige_llm_trace.attempt IS
  '1-based attempt number within request_id. Every attempt that reached a provider is billable '
  'whether or not it succeeded — a failed attempt that consumed tokens still costs money.';

-- ── 1e. Estimated vs actual, kept apart ──────────────────────────────────────────────────────
ALTER TABLE public.paige_llm_trace
  ADD COLUMN IF NOT EXISTS cost_actual_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

COMMENT ON COLUMN public.paige_llm_trace.cost_estimate_usd IS
  'ESTIMATE from the versioned pricing registry (see pricing_version + cost_basis). Never an invoice.';
COMMENT ON COLUMN public.paige_llm_trace.cost_actual_usd IS
  'Invoice-CONFIRMED cost. Stays NULL until a provider invoice is reconciled against '
  'provider_request_id. An estimate must never be written here.';

-- ── 1f. Indexes for the rollups this exists to serve ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_llm_trace_request ON public.paige_llm_trace (request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_trace_tenant_time ON public.paige_llm_trace (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_trace_provider_request ON public.paige_llm_trace (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

-- ─── THE VERSIONED PRICING REGISTRY ──────────────────────────────────────────────────────────
--
-- Brief: "Use a versioned pricing registry. Do not scatter current model prices through
-- application code." Today the only pricing statement in the system is the cost_basis STRING
-- stamped on each row — it records the basis but not the numbers, so no historical row can be
-- re-derived or audited. Prices change; a row costed in July must keep its July price.
--
-- Rows are data, not code: a repricing is an INSERT of a new pricing_version, never an UPDATE of
-- an existing one. Traces pin the version that priced them, so history never silently moves.
CREATE TABLE IF NOT EXISTS public.paige_model_pricing (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_version          text        NOT NULL,
  model_provider           text        NOT NULL,
  model                    text        NOT NULL,
  -- All rates are per MILLION tokens, in `currency`. NULL = this provider does not charge for it,
  -- or we do not have a verified published rate. NULL is never treated as free (see the estimator).
  input_per_mtok           numeric(12,6),
  cache_read_per_mtok      numeric(12,6),
  cache_write_5m_per_mtok  numeric(12,6),
  cache_write_1h_per_mtok  numeric(12,6),
  output_per_mtok          numeric(12,6),
  reasoning_per_mtok       numeric(12,6),
  currency                 text        NOT NULL DEFAULT 'USD',
  effective_from           timestamptz NOT NULL,
  effective_to             timestamptz,
  -- Where the number came from, so a price can be challenged without re-deriving it from memory.
  source                   text        NOT NULL,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paige_model_pricing_unique UNIQUE (pricing_version, model_provider, model)
);

COMMENT ON TABLE public.paige_model_pricing IS
  'Versioned price list. A repricing INSERTs a new pricing_version; it never UPDATEs an existing '
  'row, because traces pin the version that priced them and history must not move under them.';

ALTER TABLE public.paige_model_pricing ENABLE ROW LEVEL SECURITY;
-- Operator-readable, service-writable. Not tenant-facing: these are OUR wholesale costs, and a
-- tenant seeing the platform's buy rate is a commercial leak, not a feature (§9).
DROP POLICY IF EXISTS paige_model_pricing_operator_read ON public.paige_model_pricing;
CREATE POLICY paige_model_pricing_operator_read ON public.paige_model_pricing
  FOR SELECT USING (public.is_platform_operator());
DROP POLICY IF EXISTS paige_model_pricing_service_write ON public.paige_model_pricing;
CREATE POLICY paige_model_pricing_service_write ON public.paige_model_pricing
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed: the two model families actually observed in live traces (claude-sonnet-5 on 141 calls,
-- claude-haiku-4-5 on 260). Rates are the PUBLISHED list prices verified against the Claude API
-- reference; cache multipliers are the documented ~0.1x read / ~1.25x write on the input rate.
--
-- HONEST GAP (§13): the 1-hour cache-write rate is deliberately NULL. A 1h TTL exists in the API,
-- but this session did not verify its published multiplier, and a guessed price is worse than an
-- absent one — the estimator below refuses to price a row whose rate is missing rather than
-- quietly costing it at zero.
INSERT INTO public.paige_model_pricing
  (pricing_version, model_provider, model, input_per_mtok, cache_read_per_mtok,
   cache_write_5m_per_mtok, cache_write_1h_per_mtok, output_per_mtok, reasoning_per_mtok,
   effective_from, source, notes)
VALUES
  ('2026-08', 'anthropic', 'claude-sonnet-5',  3.00, 0.30, 3.75, NULL, 15.00, 15.00,
   '2026-08-01', 'Anthropic published list price',
   'Intro pricing of $2.00 in / $10.00 out ran through 2026-08-31; standard rate recorded here. '
   'Reasoning billed as output.'),
  ('2026-08', 'anthropic', 'claude-haiku-4-5', 1.00, 0.10, 1.25, NULL,  5.00,  5.00,
   '2026-08-01', 'Anthropic published list price', 'Reasoning billed as output.'),
  ('2026-08', 'anthropic', 'claude-haiku-4-5-20251001', 1.00, 0.10, 1.25, NULL, 5.00, 5.00,
   '2026-08-01', 'Anthropic published list price',
   'Dated snapshot of claude-haiku-4-5 seen in live traces; same rates.')
ON CONFLICT (pricing_version, model_provider, model) DO NOTHING;

-- ─── THE ESTIMATOR ───────────────────────────────────────────────────────────────────────────
--
-- Prices a trace from the registry. Returns NULL — never 0 — when the model has no price row or a
-- needed rate is missing. A missing price must read as "unpriced", because a 0 is indistinguishable
-- from "free" on every downstream sum, and that is exactly how ~$42-57 of spend came to be
-- represented as $1.38.
CREATE OR REPLACE FUNCTION public.estimate_llm_cost_usd(
  _model_provider text, _model text, _pricing_version text,
  _in_uncached int, _cache_read int, _cache_write_5m int, _cache_write_1h int,
  _out int, _reasoning int
) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.paige_model_pricing%ROWTYPE; total numeric := 0;
BEGIN
  IF _model_provider IS NULL OR _model IS NULL OR _pricing_version IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO p FROM public.paige_model_pricing
   WHERE pricing_version = _pricing_version AND model_provider = _model_provider AND model = _model;
  IF NOT FOUND THEN RETURN NULL; END IF;   -- unpriced, and says so

  -- Each component is priced only if BOTH a quantity and a rate exist. A quantity with no rate
  -- makes the whole estimate NULL rather than silently under-counting that component.
  IF COALESCE(_in_uncached,0)   > 0 THEN
    IF p.input_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_in_uncached::numeric / 1000000) * p.input_per_mtok; END IF;
  IF COALESCE(_cache_read,0)    > 0 THEN
    IF p.cache_read_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_cache_read::numeric / 1000000) * p.cache_read_per_mtok; END IF;
  IF COALESCE(_cache_write_5m,0) > 0 THEN
    IF p.cache_write_5m_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_cache_write_5m::numeric / 1000000) * p.cache_write_5m_per_mtok; END IF;
  IF COALESCE(_cache_write_1h,0) > 0 THEN
    IF p.cache_write_1h_per_mtok IS NULL THEN RETURN NULL; END IF;  -- deliberately unseeded
    total := total + (_cache_write_1h::numeric / 1000000) * p.cache_write_1h_per_mtok; END IF;
  IF COALESCE(_out,0)           > 0 THEN
    IF p.output_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_out::numeric / 1000000) * p.output_per_mtok; END IF;
  IF COALESCE(_reasoning,0)     > 0 THEN
    IF p.reasoning_per_mtok IS NULL THEN RETURN NULL; END IF;
    total := total + (_reasoning::numeric / 1000000) * p.reasoning_per_mtok; END IF;

  RETURN round(total, 6);
END; $$;

COMMENT ON FUNCTION public.estimate_llm_cost_usd(text,text,text,int,int,int,int,int,int) IS
  'Prices one trace from paige_model_pricing. Returns NULL (never 0) for an unpriced model or a '
  'missing rate — an unpriced call must not read as a free one.';

-- ─── STEP 2 — THE TENANT-SCOPED METERING LEDGER BRIDGE ───────────────────────────────────────
--
-- Brief: "Connect the trace to tenant-scoped platform_metered_events."
--
-- WHY A TRIGGER RATHER THAN AN APPLICATION WRITE. The trace insert is DETACHED and best-effort by
-- design (llm-trace.ts fires it through EdgeRuntime.waitUntil and swallows failures, so tracing can
-- never add latency to or break a generation). That is right for observability and wrong for
-- billing: a second, independent best-effort write would drop meter events silently. Making the
-- meter a trigger on the trace INSERT means the two are ATOMIC — if the trace row lands, its meter
-- event lands in the same transaction. There is no window in which usage exists unmetered.
--
-- IDEMPOTENCY IS STRUCTURAL. idempotency_key = 'llm_trace:' || trace.id, and
-- platform_metered_events.idempotency_key already carries a UNIQUE constraint. A replayed insert
-- collides and does nothing. No retry can double-charge, and the guarantee is enforced by the
-- database rather than by application discipline.
--
-- TENANT IDENTITY IS SERVER-DERIVED. tenant_id is copied from the trace row, which is written only
-- by the service role (RLS policy paige_llm_trace_service) and passed cleanTenantId(). No browser
-- value reaches this path, and nothing here reads a request body.
--
-- WHICH TRACES QUALIFY, and why each exclusion is deliberate:
--   • tenant_id IS NULL  → NO event. 217 of 640 live rows are platform-scope (operator console,
--     system jobs). They are real internal cost but there is no tenant to bill, and the ledger's own
--     CHECK (pme_layer_matches_subject) requires tenant_id NOT NULL. Inventing a tenant to satisfy
--     the constraint would be a fabricated charge. Platform-scope cost is tracked in the trace and
--     reported separately.
--   • zero consumption → NO event. A needs_config row, or a request rejected before it reached the
--     provider, consumed nothing. The 3 live 'google/*' rows are exactly this: stale gateway model
--     slugs that Anthropic rejected with a 400 in ~200ms, zero tokens, zero cost.
--   • a FAILED call that DID consume tokens → EVENT. The provider bills for it, so we record it.
CREATE OR REPLACE FUNCTION public.meter_llm_trace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _billable_tokens bigint;
  _cost numeric;
  _cost_is_estimate boolean;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  _billable_tokens :=
      COALESCE(NEW.tokens_in_uncached, NEW.tokens_in, 0)
    + COALESCE(NEW.tokens_cache_read, 0)
    + COALESCE(NEW.tokens_cache_write_5m, 0)
    + COALESCE(NEW.tokens_cache_write_1h, 0)
    + COALESCE(NEW.tokens_out, 0)
    + COALESCE(NEW.tokens_reasoning, 0);

  IF _billable_tokens = 0 AND COALESCE(NEW.billable_units, '{}'::jsonb) = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- An actual reconciled cost wins over an estimate; the distinction is carried into metadata so a
  -- reader can never mistake one for the other.
  _cost_is_estimate := NEW.cost_actual_usd IS NULL;
  _cost := COALESCE(NEW.cost_actual_usd, NEW.cost_estimate_usd);

  INSERT INTO public.platform_metered_events (
    tenant_id, service_category, event_type, provider, quantity,
    wholesale_cost_usd, tenant_retail_charge_usd,
    layer, subject_type, subject_id, idempotency_key, occurred_at, metadata
  ) VALUES (
    NEW.tenant_id,
    'ai_inference',
    COALESCE(NEW.job_kind, 'llm_call'),
    -- The BILLING provider, not the legacy slug: this column feeds invoice reconciliation.
    COALESCE(NEW.billing_provider, NEW.model_provider, NEW.provider),
    _billable_tokens,
    -- NOT NULL DEFAULT 0 on the column, so an unpriced call records 0 here. metadata.cost_known
    -- says whether that 0 is a real zero or an absent price — the sum alone must not be trusted.
    COALESCE(_cost, 0),
    NULL,                       -- retail is a pricing decision, not a cost fact. Deliberately unset.
    'L3_tenant_passthrough',
    'tenant',
    NEW.tenant_id,
    'llm_trace:' || NEW.id::text,
    NEW.created_at,
    jsonb_strip_nulls(jsonb_build_object(
      'trace_id',             NEW.id,
      'request_id',           NEW.request_id,
      'provider_request_id',  NEW.provider_request_id,
      'attempt',              NEW.attempt,
      'is_retry',             NEW.is_retry,
      'is_fallback',          NEW.is_fallback,
      'status',               NEW.status,
      'gateway_provider',     NEW.gateway_provider,
      'model_provider',       NEW.model_provider,
      'model',                NEW.model,
      'pricing_version',      NEW.pricing_version,
      'capability',           NEW.capability,
      'tier',                 NEW.tier,
      'tokens_in_uncached',   COALESCE(NEW.tokens_in_uncached, NEW.tokens_in),
      'tokens_cache_read',    NEW.tokens_cache_read,
      'tokens_cache_write_5m',NEW.tokens_cache_write_5m,
      'tokens_cache_write_1h',NEW.tokens_cache_write_1h,
      'tokens_out',           NEW.tokens_out,
      'tokens_reasoning',     NEW.tokens_reasoning,
      'billable_units',       NULLIF(NEW.billable_units, '{}'::jsonb),
      'cost_is_estimate',     _cost_is_estimate,
      'cost_known',           _cost IS NOT NULL,
      'cost_basis',           NEW.cost_basis,
      'run_id',               NEW.run_id,
      'workflow_id',          NEW.workflow_id,
      'conversation_id',      NEW.conversation_id,
      'task_id',              NEW.task_id,
      'agent_id',             NEW.agent_id
    ))
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A metering failure must not destroy the observability row (the trace insert is the only record
  -- that the call happened at all). Warn loudly and continue; the unmetered row is then VISIBLE in
  -- v_llm_trace_unmetered below, so the gap is detectable rather than silent (§32).
  RAISE WARNING 'meter_llm_trace failed for trace %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_meter_llm_trace ON public.paige_llm_trace;
CREATE TRIGGER trg_meter_llm_trace
  AFTER INSERT ON public.paige_llm_trace
  FOR EACH ROW EXECUTE FUNCTION public.meter_llm_trace();

COMMENT ON FUNCTION public.meter_llm_trace() IS
  'Step 2 bridge: one durable platform_metered_events row per billable trace, atomic with the trace '
  'insert. Idempotent via UNIQUE idempotency_key. Skips platform-scope (tenant_id NULL) and '
  'zero-consumption rows. Never writes a retail charge — that is a pricing decision, not a cost.';

-- ─── RECONCILIATION SURFACES ─────────────────────────────────────────────────────────────────
--
-- Brief: "Auditable reconciliation from raw provider usage to tenant-facing usage." Two views, both
-- security_invoker so RLS applies to the reader (#116 — a security_definer view here would leak
-- every tenant's spend to any caller).

-- Every trace that SHOULD have produced a meter event and did not. On a healthy system this is
-- empty. It is the detector that keeps the trigger's EXCEPTION handler from hiding a failure.
CREATE OR REPLACE VIEW public.v_llm_trace_unmetered
WITH (security_invoker = on) AS
SELECT t.id AS trace_id, t.tenant_id, t.created_at, t.model, t.model_provider, t.status,
       COALESCE(t.tokens_in_uncached, t.tokens_in, 0) + COALESCE(t.tokens_out, 0) AS tokens_seen
  FROM public.paige_llm_trace t
  LEFT JOIN public.platform_metered_events m
         ON m.idempotency_key = 'llm_trace:' || t.id::text
 WHERE t.tenant_id IS NOT NULL
   AND m.id IS NULL
   AND (COALESCE(t.tokens_in_uncached, t.tokens_in, 0) + COALESCE(t.tokens_out, 0)) > 0;

COMMENT ON VIEW public.v_llm_trace_unmetered IS
  'Traces that consumed provider resources for a tenant but produced no metered event. Expected to '
  'be EMPTY. Non-empty means the bridge failed and usage is going unbilled — the gap this view '
  'exists to make visible rather than silent.';

-- The paired view: each meter event beside the trace that produced it, with the estimate/actual
-- distinction preserved rather than flattened.
CREATE OR REPLACE VIEW public.v_llm_usage_reconciliation
WITH (security_invoker = on) AS
SELECT
  m.id                AS meter_event_id,
  m.idempotency_key,
  m.tenant_id,
  m.occurred_at,
  m.quantity          AS billable_tokens,
  m.wholesale_cost_usd,
  m.tenant_retail_charge_usd,
  (m.metadata->>'cost_is_estimate')::boolean AS cost_is_estimate,
  (m.metadata->>'cost_known')::boolean       AS cost_known,
  m.metadata->>'model'                       AS model,
  m.metadata->>'model_provider'              AS model_provider,
  m.metadata->>'gateway_provider'            AS gateway_provider,
  m.provider                                 AS billing_provider,
  m.metadata->>'pricing_version'             AS pricing_version,
  (m.metadata->>'attempt')::int              AS attempt,
  (m.metadata->>'is_retry')::boolean         AS is_retry,
  (m.metadata->>'is_fallback')::boolean      AS is_fallback,
  m.metadata->>'status'                      AS call_status,
  (m.metadata->>'request_id')::uuid          AS request_id,
  m.metadata->>'provider_request_id'         AS provider_request_id,
  t.id                                       AS trace_id,
  t.cost_estimate_usd,
  t.cost_actual_usd,
  t.reconciled_at
FROM public.platform_metered_events m
LEFT JOIN public.paige_llm_trace t
       ON t.id = NULLIF(m.metadata->>'trace_id', '')::uuid
WHERE m.service_category = 'ai_inference';

COMMENT ON VIEW public.v_llm_usage_reconciliation IS
  'Meter event beside the trace that produced it. cost_is_estimate / cost_known are surfaced as '
  'first-class columns so no reader can mistake a list-price estimate — or an absent price — for an '
  'invoice-confirmed amount.';

-- ─── INVOICE RECONCILIATION ──────────────────────────────────────────────────────────────────
-- When a provider invoice later confirms a real cost, updating the trace propagates to the ledger.
-- Only cost_actual_usd flows through; an estimate never overwrites a confirmed figure, and the
-- event's identity and quantity are immutable.
CREATE OR REPLACE FUNCTION public.reconcile_llm_trace_cost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cost_actual_usd IS NOT NULL
     AND NEW.cost_actual_usd IS DISTINCT FROM OLD.cost_actual_usd
     AND NEW.tenant_id IS NOT NULL THEN
    UPDATE public.platform_metered_events
       SET wholesale_cost_usd = NEW.cost_actual_usd,
           metadata = metadata || jsonb_build_object(
             'cost_is_estimate', false,
             'cost_known', true,
             'reconciled_at', COALESCE(NEW.reconciled_at, now()),
             'estimate_was', NEW.cost_estimate_usd
           )
     WHERE idempotency_key = 'llm_trace:' || NEW.id::text;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'reconcile_llm_trace_cost failed for trace %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reconcile_llm_trace_cost ON public.paige_llm_trace;
CREATE TRIGGER trg_reconcile_llm_trace_cost
  AFTER UPDATE OF cost_actual_usd ON public.paige_llm_trace
  FOR EACH ROW EXECUTE FUNCTION public.reconcile_llm_trace_cost();

COMMENT ON FUNCTION public.reconcile_llm_trace_cost() IS
  'Propagates an invoice-confirmed cost onto its meter event, preserving the prior estimate in '
  'metadata.estimate_was. Quantity and identity are never rewritten.';
