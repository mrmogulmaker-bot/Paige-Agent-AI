-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- MET1 — production rollback proof for `meter_llm_usage` (migration 20261033000000).
--
-- HOW TO RUN: paste whole, against production. It is wrapped BEGIN..ROLLBACK, so it installs the
-- migration, drains the real backlog, grades twelve properties, and leaves the database untouched.
--
-- WHAT A ROLLBACK PROOF DOES AND DOES NOT SHOW (§32): it proves the SQL RUNS and that the stated
-- properties hold against REAL production data. It proves NOTHING about the migration being live.
-- The persisted-apply confirmation is a separate, post-merge step (`deploy-migrations.yml` →
-- schema_migrations advanced → the object queried directly).
--
-- C1/C2 are CONTROLS: they measure the defect BEFORE anything claims to fix it. If C1 ever reports
-- rows, this proof is being run against a database where the meter already ran, and P1/P4's exact
-- counts are meaningless — read the failure, do not adjust the numbers to match.
--
-- Counts are pinned to production as measured 2026-09-01 (228 meterable traces, 15,578,931 tokens,
-- 197 unpriced / 31 priced). They are EXPECTED to drift as Paige runs. A drifted count is not a
-- defect; silently loosening the assertion to `> 0` so it keeps passing IS one — re-measure and
-- re-pin deliberately, so the proof keeps grading a known quantity rather than any quantity.
--
-- MUTATION-TESTED 2026-09-01. Every assertion was driven against a deliberately broken variant and
-- confirmed to go red. Two findings from that pass are baked in below:
--   • P6's first draft asserted "every row carries a cost". It FAILED, correctly — `jsonb_strip_nulls`
--     was deleting the key on the 197 unpriced rows. The honest property is that the KEY IS ALWAYS
--     PRESENT, so an absent cost is stated rather than implied.
--   • P6b's first draft counted `metadata->>'cost_estimate_usd' IS NULL`, which answers NULL for an
--     ABSENT key as well as an explicit JSON null — so it passed under the very mutation it was
--     written to catch. It now compares against `'null'::jsonb`, and goes red as it should.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TEMP TABLE _p(ord int, res text, label text);
INSERT INTO _p SELECT 1, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C1 control: NO llm usage has ever been metered before (' || count(*) || ' rows)'
  FROM public.platform_usage_events WHERE event_type='llm_tokens';
INSERT INTO _p SELECT 2, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'C2 control: the function does not already exist'
  FROM pg_proc WHERE proname='meter_llm_usage';

\i supabase/migrations/20261033000000_her_spend_becomes_billable_usage.sql
-- (If your client cannot \i, paste the migration body here verbatim. Do NOT retype it from memory:
--  a proof that grades a hand-copied approximation of the migration grades the wrong thing.)

CREATE TEMP TABLE _r1 AS SELECT public.meter_llm_usage(5000) AS j;
INSERT INTO _p SELECT 3, CASE WHEN (j->>'metered')::int = 228 THEN 'ok' ELSE 'FAIL' END,
  'P1 first run metered ' || (j->>'metered') || ' traces (expected the 228 meterable)' FROM _r1;
INSERT INTO _p SELECT 4, CASE WHEN (j->>'unattributable_traces')::int > 0 AND (j->>'zero_token_traces')::int > 0 THEN 'ok' ELSE 'FAIL' END,
  'P2 ...and REPORTS what it skipped: ' || (j->>'unattributable_traces') || ' unattributable, '
  || (j->>'zero_token_traces') || ' zero-token' FROM _r1;

CREATE TEMP TABLE _r2 AS SELECT public.meter_llm_usage(5000) AS j;
INSERT INTO _p SELECT 5, CASE WHEN (j->>'metered')::int = 0 THEN 'ok' ELSE 'FAIL' END,
  'P3 a second run meters NOTHING - re-running cannot double-count (' || (j->>'metered') || ')' FROM _r2;

INSERT INTO _p SELECT 6, CASE WHEN count(*)=228 AND sum(quantity)=15578931 THEN 'ok' ELSE 'FAIL' END,
  'P4 ' || count(*) || ' usage rows carrying ' || sum(quantity) || ' tokens - matching the traces exactly'
  FROM public.platform_usage_events WHERE event_type='llm_tokens';

INSERT INTO _p SELECT 7, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P5 no usage row was written for a trace with no tenant'
  FROM public.platform_usage_events WHERE event_type='llm_tokens' AND tenant_id IS NULL;

INSERT INTO _p SELECT 8, CASE WHEN bool_and(metadata ? 'cost_estimate_usd' AND metadata ? 'cost_basis'
                                            AND metadata->>'estimated'='true') THEN 'ok' ELSE 'FAIL' END,
  'P6 EVERY row carries the cost keys and is labelled an estimate - an unpriced call says so'
  FROM public.platform_usage_events WHERE event_type='llm_tokens';

-- `->'k' = 'null'::jsonb`, NOT `->>'k' IS NULL`. See the mutation note in the header.
INSERT INTO _p SELECT 9, CASE WHEN count(*) FILTER (WHERE metadata->'cost_estimate_usd' = 'null'::jsonb)=197
                               AND count(*) FILTER (WHERE jsonb_typeof(metadata->'cost_estimate_usd')='number')=31
                          THEN 'ok' ELSE 'FAIL' END,
  'P6b ' || count(*) FILTER (WHERE metadata->'cost_estimate_usd' = 'null'::jsonb)
  || ' EXPLICITLY null + ' || count(*) FILTER (WHERE jsonb_typeof(metadata->'cost_estimate_usd')='number')
  || ' priced = ' || count(*) || ' rows' FROM public.platform_usage_events WHERE event_type='llm_tokens';

INSERT INTO _p SELECT 10, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P6c no unpriced row is readable as a ZERO cost (json null, never the number 0)'
  FROM public.platform_usage_events
  WHERE event_type='llm_tokens' AND metadata->'cost_estimate_usd' = to_jsonb(0);

INSERT INTO _p SELECT 11, CASE WHEN count(*)=0 THEN 'ok' ELSE 'FAIL' END,
  'P7 no billing column was touched - reconciled_invoice_id is untouched on every row'
  FROM public.platform_usage_events WHERE event_type='llm_tokens' AND reconciled_invoice_id IS NOT NULL;

DO $x$ BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.meter_llm_usage(1);
    RESET ROLE;
    INSERT INTO _p VALUES (12,'FAIL','P8 an authenticated caller cannot run the meter - IT RAN');
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO _p VALUES (12,'ok','P8 an authenticated caller cannot run the meter (42501)');
  WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO _p VALUES (12,'FAIL','P8 wrong error: ' || SQLSTATE);
  END;
END $x$;

SELECT res, label FROM _p ORDER BY ord;
ROLLBACK;
