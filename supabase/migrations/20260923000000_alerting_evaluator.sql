-- =============================================================================
-- Platform Alerting Substrate — A2 (the evaluator)
-- =============================================================================
-- Additive: one new column, two catalogue corrections, one cron schedule. No ALTER that
-- drops or retypes anything, no data migration.
--
-- Companion to `supabase/functions/alerting-evaluate/index.ts`. A2 writes FIRINGS ONLY —
-- delivery is A3 and routes through `_shared/channel-adapters.ts` (§18).
-- =============================================================================

-- ── 1. Episode bookkeeping, for sustained-for and edge-triggered firing ──────
-- `for_minutes` on a condition means "held continuously for N minutes", which needs to
-- know when the current unbroken episode began. This column is that.
--
-- It also makes firing EDGE-TRIGGERED: a rule fires at most once per episode (only when
-- the episode began after the last firing). Without it a rule re-fires on every tick for
-- as long as the condition holds, which is how an alerting system teaches its operator to
-- ignore it — the failure mode that matters more than a missed alert, because it is silent.
ALTER TABLE public.paige_alert_rule
  ADD COLUMN IF NOT EXISTS condition_met_since timestamptz;

COMMENT ON COLUMN public.paige_alert_rule.condition_met_since IS
  'When the current unbroken episode of the condition holding began; NULL when it does not hold. Drives for_minutes and once-per-episode firing.';

-- ── 2. §13 catalogue corrections, recorded not silently patched ──────────────
-- A1 seeded `llm.failover_rate` as readable, and the architecture note claimed L1
-- observability already backed it. VERIFIED FALSE against the live schema:
-- `paige_llm_trace` has columns status / error_class / provider / model / tier and NOTHING
-- that records "this call fell through to a fallback provider". There is no failover marker
-- to read, so the signal cannot be honestly evaluated and is flipped to unreadable — the
-- same treatment `migrations.drift` already gets, for the same reason.
--
-- Quietly pointing the existing key at an ERROR rate instead would have shipped a number
-- whose name says one thing and whose value means another — the two-numbers-one-label
-- defect the §39 peer gate caught on the Tenants rail. So the honest signal gets its own key.
UPDATE public.paige_alert_signal
   SET is_readable = false,
       reader      = NULL,
       notes       = 'NOT READABLE. paige_llm_trace records no failover marker (columns: status, '
                     'error_class, provider, model, tier) — verified against the live schema '
                     '2026-08-20. A1 seeded this as readable in error. Use llm.error_rate, which '
                     'the schema genuinely supports. Becomes readable only if the router starts '
                     'recording a fallback marker on the trace.'
 WHERE key = 'llm.failover_rate';

INSERT INTO public.paige_alert_signal (key, label, description, value_kind, is_readable, reader, notes)
VALUES
  ('llm.error_rate',
   'LLM error rate',
   'Share of traced model calls in the last hour that ended in an error (0..1).',
   'rate', true, 'paige_llm_trace',
   'status=''error'' over all traces in the trailing hour. With ZERO calls in the window the '
   'rate is undefined, not 0 — the reader reports it unreadable for that tick rather than '
   'returning a reassuring zero (§13).')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Schedule the sweep ────────────────────────────────────────────────────
-- Every 5 minutes. The cadence is the resolution of `for_minutes`: a sustain shorter than
-- one tick cannot be observed, which is worth knowing when authoring a rule.
--
-- Mirrors the systems-check operator schedule exactly (cron_token_header(), same host, same
-- shape) — §18, one way to poke an internal edge function, not a second convention.
select cron.schedule(
  'alerting-evaluate',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/alerting-evaluate',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-token', public.cron_token_header()
                 ),
      body    := '{}'::jsonb
    );
  $$
);
