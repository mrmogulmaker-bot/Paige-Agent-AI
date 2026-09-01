-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The meter actually runs.
--
-- 20261033000000 built `meter_llm_usage`: it turns a recorded LLM call into a billable usage row,
-- it is idempotent, it refuses any caller holding a JWT, and it was proven against production.
-- Nothing has ever called it. Grepped 2026-09-01 across the whole repository — the only references
-- are its own proof script and a comment in a test harness. No pg_cron job, no edge function, no
-- workflow, no frontend.
--
-- So the state of the meter until this migration is: correct, proven, and inert. That is the exact
-- shape §68 names as the failure worth catching — a mechanism that is registered, has a working
-- runner, and has never once executed, while everything downstream quietly assumes it has. The
-- cross-tenant leak canary was found in precisely this condition, honestly reporting
-- `canary_never_run` into an empty room. Building a meter and not scheduling it is the same
-- omission with money attached rather than isolation.
--
-- ── WHY pg_cron CALLING THE FUNCTION DIRECTLY, and not an edge function behind net.http_post.
--
-- Eleven jobs already run on this instance. Nine of them POST to an edge function because they
-- need to leave the database; two — `growth-submission-sweeper` and `operator-mrr-snapshot-daily`
-- — call a plain SQL function, because their whole job is in-database. The meter is the second
-- kind: it reads `paige_llm_trace` and writes `platform_usage_events`, both local. An HTTP hop
-- would add a shared secret, a deploy, a cold start and a failure mode, and buy nothing.
--
-- It also fits the function's OWN guard without changing it. `meter_llm_usage` raises 42501 unless
-- `auth.uid()` IS NULL — a tenant must never be able to write their own usage records. A pg_cron
-- session carries no `request.jwt.claims`, so `auth.uid()` is NULL and the job is admitted, while
-- every JWT-bearing caller is still refused. That is asserted both ways in the proof rather than
-- assumed from the shape of it.
--
-- ── WHY HOURLY, derived rather than picked.
--
-- Measured on production 2026-09-01: 673 traces since 2026-07-20, 33 in the last seven days, 11 in
-- the last twenty-four hours — roughly five a day at current volume. The default `p_limit` is 500.
-- Hourly is therefore two orders of magnitude more headroom than the arrival rate needs, costs one
-- trivial indexed query per hour, and bounds "spend that has happened but is not yet recorded" at
-- one hour. The minute is :35 to stay clear of the :00/:02/:05/:20 clusters the existing jobs sit
-- in; `systems-check-operator` already owns `0 * * * *`.
--
-- ── WHAT THE FIRST RUN DOES, said out loud rather than discovered.
--
-- There is a backlog of 233 traces that carry a tenant and a non-zero token count and have never
-- been metered, the oldest from 20 July. The first execution meters all of them — under the
-- default limit, in one pass. They are recorded at `occurred_at = trace.created_at`, so the usage
-- lands at the time it actually happened rather than being stamped as today; a July call becoming
-- a September usage row would be a worse lie than not recording it. Nothing bills off
-- `platform_usage_events` yet, so this is a backfill of the record, not of a charge.
--
-- ── OBSERVABILITY, because §68's other half is that a loop nobody can see is indistinguishable
-- from one that never ran. `cron.job_run_details` is populated and readable on this instance
-- (verified — the existing jobs' rows are there), so "did the meter run at 05:35" is answerable
-- without adding a table. The counts are already answerable from `platform_usage_events` itself.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Idempotent by the repo's existing pattern: drop any prior job of this name, tolerate its
-- absence, then schedule. A migration that fails on re-run is a migration that blocks a rebuild.
DO $$
BEGIN
  PERFORM cron.unschedule('meter-llm-usage-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'meter-llm-usage-hourly',
  '35 * * * *',
  $job$ SELECT public.meter_llm_usage(); $job$
);
