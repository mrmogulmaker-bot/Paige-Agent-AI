-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Paige's model spend is observable and not billable. This carries the trace into the meter.
--
-- MEASURED ON PRODUCTION, 2026-09-01:
--
--   paige_llm_trace            663 rows · newest today · 13 tenants · $1.3810 estimated
--   …attributable to a tenant  438 rows · 15,578,931 tokens
--   platform_usage_events      91 rows — 'tenant_provisioned' and 'tts_char'. NO LLM usage. Ever.
--
-- So fifteen and a half million tokens have been spent on tenants' behalf and no usage record
-- exists for any of them. Observability without a meter is exactly the state §67 warns about: at
-- `confirm` the human is the throttle, at `auto` there is none, and nothing downstream can even
-- see what was spent.
--
-- §18 — THE HOME ALREADY EXISTS AND IS ALREADY USED FOR THIS. `platform_usage_events` carries
-- `tts_char` today with the same shape (tenant, event_type, quantity, unit, occurred_at, metadata).
-- LLM tokens are Engine-2 usage and belong beside it. `platform_metered_events` was the wrong
-- table and its own CHECK says so: `layer` admits only 'L1_platform' or 'L3_tenant_passthrough',
-- and Paige's own inference is neither a platform subscription nor a third-party pass-through.
--
-- A DRAIN, NOT A TRIGGER. A trigger on `paige_llm_trace` would run inside the trace insert, so a
-- metering failure would fail the TRACE — breaking observability to protect billing, which is
-- backwards. A drain is non-blocking, idempotent, picks up the existing backlog without a separate
-- backfill, and matches `paige-action-worker`'s established shape.
--
-- §13 — WHAT THIS RECORDS, AND WHAT IT DOES NOT.
--   • `quantity` is tokens, a measured number.
--   • `cost_estimate_usd` travels in metadata under that name, with the trace's own `cost_basis`
--     string, and is NEVER promoted to a billing column. It is an estimate at list price
--     excluding caching, thinking and tool round-trips; calling it a cost would be the exact
--     over-claim the trace's own naming avoids.
--   • RECORDING USAGE IS NOT CHARGING FOR IT. Nothing here reads a price book, touches an invoice,
--     or sets `reconciled_invoice_id`. It writes what was used so a billing decision CAN be made;
--     making it is a separate, owner-owned step.
--
-- §13 — WHAT IS UNPRICED, AND WHY THE BACKLOG STAYS THAT WAY. Of the 228 traces this first drains,
-- 197 (86%) carry NO cost_estimate_usd and no cost_basis — 15,475,175 of 15,578,931 tokens, 99.3%.
-- The 31 priced rows all came through `_shared/model-router`; the 197 unpriced all came through the
-- DIRECT `_shared/claude.ts` path, which had the provider's own `usage` in hand at the trace site
-- and never priced it. That is fixed at the writer in this same change (`estimateTokenCostUsd` in
-- `_shared/llm-trace.ts`), so every FUTURE trace is priced whichever path produced it.
--
-- The historical 197 are deliberately NOT back-priced here. Re-deriving a cost for a call whose
-- model pricing at the time is not recorded would be inventing a figure and stamping it as measured.
-- They meter their TOKENS — the measured, billable quantity — and carry an explicit null cost.
--
-- §13 — WHAT IT UNDER-COUNTS, stated rather than discovered later. Of 258 successful
-- tenant-attributed Anthropic traces, 30 recorded ZERO tokens — roughly 12% capture no usage at
-- all. The meter reflects what the trace captured, so it under-counts by that much until the
-- capture gap is closed. The other 180 zero-token traces are genuine errors and correctly meter
-- nothing. 225 further traces carry NO tenant, so they are Paige's spend that is attributable to
-- nobody; they are skipped and COUNTED, not silently dropped.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- IDEMPOTENCY, which this table has never had. Without it a re-run double-counts, and a meter that
-- double-counts is worse than no meter. Partial and scoped to this event type so no existing
-- writer's contract changes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_usage_llm_trace
  ON public.platform_usage_events ((metadata->>'trace_id'))
  WHERE event_type = 'llm_tokens';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ON THE `lint_migrations.py` PATTERN-2 WARNING THIS FILE RAISES, answered rather than left to be
-- re-derived on every CI run:
--
--     PATTERN-2 (warn) — INSERT … SELECT present; verify no NOT NULL target column maps from a
--     nullable source (23502 on fresh rebuild).
--
-- The guard is right to point here. `platform_usage_events` has four NOT NULL columns fed from
-- this SELECT, and two of the sources ARE nullable on `paige_llm_trace`. Each is guarded:
--
--   tenant_id   ← t.tenant_id            NULLABLE, and the CTE carries `WHERE t.tenant_id IS NOT
--                                        NULL`. An unattributable trace is counted and reported,
--                                        never metered to a guessed tenant.
--   quantity    ← c.tin + c.tout         BOTH nullable, both COALESCE(…,0) in the CTE, so the sum
--                                        cannot be null; `> 0` then excludes the zero case.
--   occurred_at ← t.created_at           NOT NULL with DEFAULT now() on the source.
--   metadata    ← jsonb_strip_nulls(…)   jsonb_build_object never returns null, strip_nulls of a
--                 || jsonb_build_object  non-null is non-null, and `||` of two non-nulls likewise.
--
-- DRIVEN, not read (2026-09-01, production, inside BEGIN … ROLLBACK): four adversarial traces —
-- no tenant, null token counts, zero tokens, and one real — alongside the 234 live traces the run
-- actually metered, with 231 unattributable and 212 zero-token rows present in the same pass. No
-- 23502. The three bad shapes were skipped and the real one metered at 10 tokens, which is what
-- keeps "skipped" from being indistinguishable from "the function did nothing" — an earlier
-- version of that assertion passed while the function did not exist at all.
--
-- The warning stays. It is a pattern match doing its job, and the answer belongs here rather than
-- in a suppression.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meter_llm_usage(p_limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n        int := GREATEST(LEAST(COALESCE(p_limit, 500), 5000), 1);
  _metered  int := 0;
  _skipped_no_tenant int;
  _skipped_no_tokens int;
BEGIN
  -- Service role only, exactly like `claim_filed_actions`. A tenant must never be able to write
  -- their own usage records, and under the service role `auth.uid()` is NULL.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'METER_FORBIDDEN: service role only' USING ERRCODE = '42501';
  END IF;

  WITH candidates AS (
    SELECT t.id, t.tenant_id, t.provider, t.model, t.tier, t.job_kind, t.modality, t.status,
           COALESCE(t.tokens_in, 0) AS tin, COALESCE(t.tokens_out, 0) AS tout,
           t.cost_estimate_usd, t.cost_basis, t.created_at
    FROM public.paige_llm_trace t
    WHERE t.tenant_id IS NOT NULL
      AND COALESCE(t.tokens_in, 0) + COALESCE(t.tokens_out, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_usage_events u
        WHERE u.event_type = 'llm_tokens' AND u.metadata->>'trace_id' = t.id::text
      )
    ORDER BY t.created_at
    LIMIT _n
  ), inserted AS (
    INSERT INTO public.platform_usage_events
      (tenant_id, event_type, quantity, unit, occurred_at, metadata)
    SELECT
      c.tenant_id,
      'llm_tokens',
      c.tin + c.tout,
      'token',
      c.created_at,
      -- Descriptive fields are stripped when null: an absent `tier` is noise, not information.
      jsonb_strip_nulls(jsonb_build_object(
        'trace_id',   c.id::text,
        'provider',   c.provider,
        'model',      c.model,
        'tier',       c.tier,
        'job_kind',   c.job_kind,
        'modality',   c.modality,
        'status',     c.status,
        'tokens_in',  c.tin,
        'tokens_out', c.tout
      ))
      -- The cost triple is concatenated AFTER the strip, so it is NEVER stripped. An unpriced call
      -- carries `"cost_estimate_usd": null` explicitly rather than omitting the key.
      --
      -- This is the difference between a consumer reading "this call has no cost recorded" and a
      -- consumer reading "this row's schema has no cost field" — and, worse, between either of those
      -- and a `COALESCE(…, 0)` downstream that quietly books an unpriced call as free. 197 of the
      -- 228 rows this first drains are unpriced (86%), so the distinction is the common case, not
      -- an edge. `estimated` is stamped `true` unconditionally: a cost that appears here is ALWAYS
      -- an estimate, and no row may be readable as a bill.
      || jsonb_build_object(
        'cost_estimate_usd', c.cost_estimate_usd,
        'cost_basis',        c.cost_basis,
        'estimated',         true
      )
    FROM candidates c
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _metered FROM inserted;

  -- Reported, never silent: spend nobody can be billed for is a fact the operator should see.
  SELECT count(*) INTO _skipped_no_tenant FROM public.paige_llm_trace WHERE tenant_id IS NULL;
  SELECT count(*) INTO _skipped_no_tokens FROM public.paige_llm_trace
   WHERE tenant_id IS NOT NULL AND COALESCE(tokens_in,0) + COALESCE(tokens_out,0) = 0;

  RETURN jsonb_build_object(
    'metered', _metered,
    'unattributable_traces', _skipped_no_tenant,
    'zero_token_traces', _skipped_no_tokens
  );
END;
$$;

REVOKE ALL ON FUNCTION public.meter_llm_usage(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meter_llm_usage(integer) TO service_role;

COMMENT ON FUNCTION public.meter_llm_usage(integer) IS
  'Carries paige_llm_trace rows into platform_usage_events as llm_tokens usage. Idempotent per '
  'trace, service-role only, non-blocking. Records USAGE, never a charge: the cost travels in '
  'metadata as a labelled estimate and no billing column is written.';
