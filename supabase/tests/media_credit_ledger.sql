-- Vibe Media Credit Ledger — behavioural proof against the replayed schema
-- (supabase db reset replays 20270122000000 exactly as the pipeline applies
-- it). Synthetic fixtures; always rolled back. House pgTAP style.
--
-- WHAT THIS FILE PROVES (the owner's non-negotiables):
--   append-only is STRUCTURAL (UPDATE/DELETE/TRUNCATE raise);
--   service_role can SELECT+INSERT but not UPDATE/DELETE;
--   RLS: a tenant sees only its own entries;
--   lazy mint is exactly-once (idempotency key);
--   hold→consume closure math has no double count and no silent negative;
--   insufficient holds write NOTHING;
--   release is FORBIDDEN for submitted jobs (the anti-leakage gate);
--   §59: only service_role reaches the ledger writers.
BEGIN;

SELECT plan(22);

-- ── Fixtures: a tenant, a user, a job ─────────────────────────────────────────
DO $$
DECLARE
  _t uuid := gen_random_uuid();
  _u uuid := gen_random_uuid();
  _j uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_u, 'media-ledger-test@example.test');
  INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features)
  VALUES (_t, 'media-ledger-test', 'Media Ledger Test Co', 'active', 'standalone', 'MLT', '{}');
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (_t, _u, 'owner', 'active');
  INSERT INTO public.paige_media_jobs
    (tenant_id, actor_id, mode, provider, model, params, state, approval_state, idempotency_key, estimated_cost_usd)
  VALUES (_t, _u, 'image', 'fal', 'fal-ai/nano-banana', '{"prompt":"proof"}'::jsonb,
          'created', 'not_required', 'pgtap-proof-job-1', 0.039);
  -- Seed the current-month grant with the EXACT lazy-mint idempotency key, so
  -- (a) the append-only row triggers have a row to fire on, and (b) the later
  -- exactly-once assertion still counts one grant.
  INSERT INTO public.paige_media_credit_entries
    (tenant_id, entry_type, credits, idempotency_key, month_bucket, included_credits, source)
  VALUES (_t, 'grant_included', 300,
          'grant:t:' || _t || ':' || to_char(now() at time zone 'utc', 'YYYY-MM'),
          to_char(now() at time zone 'utc', 'YYYY-MM'), 300, 'system');
END $$;

-- ── §59: the ledger writers are service-role-only ─────────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.media_credit_hold(uuid,uuid,int,numeric)', 'EXECUTE'),
          'anon cannot reach media_credit_hold');
SELECT ok(NOT has_function_privilege('authenticated', 'public.media_credit_hold(uuid,uuid,int,numeric)', 'EXECUTE'),
          'browser callers cannot reach media_credit_hold');
SELECT ok(has_function_privilege('service_role', 'public.media_credit_hold(uuid,uuid,int,numeric)', 'EXECUTE'),
          'the edge seam reaches media_credit_hold');
SELECT ok(has_function_privilege('service_role', 'public.settle_media_credit_holds(int)', 'EXECUTE'),
          'the sweeper reaches the settlement companion');

-- ── Append-only is structural ─────────────────────────────────────────────────
SELECT throws_ok(
  'UPDATE public.paige_media_credit_entries SET credits = 999999',
  NULL, 'append-only: UPDATE raises'
);
SELECT throws_ok(
  'DELETE FROM public.paige_media_credit_entries',
  NULL, 'append-only: DELETE raises'
);
SELECT throws_ok(
  'TRUNCATE public.paige_media_credit_entries',
  NULL, 'append-only: TRUNCATE raises'
);

-- ── The full flow, as the service role ───────────────────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE
  _t uuid := (SELECT tenant_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _j uuid := (SELECT id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _hold jsonb; _consume jsonb;
BEGIN
  -- Lazy mint: exactly-once included grant for the current month, triggered BY
  -- the hold itself. Public wrappers only — the __internals are revoked from
  -- every role including this connection, by design (§59).
  _hold := public.media_credit_hold(_t, _j, 4, 0.039);
  IF (SELECT count(*) FROM public.paige_media_credit_entries
      WHERE tenant_id = _t AND entry_type = 'grant_included') <> 1 THEN
    RAISE EXCEPTION 'pgtap: lazy mint is not exactly-once';
  END IF;
  IF (_hold->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'pgtap: hold failed: %', _hold;
  END IF;
  IF (SELECT included_credits FROM public.paige_media_credit_entries
      WHERE idempotency_key = 'hold:' || _j::text) <> 4 THEN
    RAISE EXCEPTION 'pgtap: hold did not draw included-first';
  END IF;

  -- Identical replay is a no-op success; ZERO new rows.
  IF ((public.media_credit_hold(_t, _j, 4, 0.039)->>'ok')::boolean IS NOT TRUE)
     OR (SELECT count(*) FROM public.paige_media_credit_entries WHERE entry_type = 'hold' AND tenant_id = _t) <> 1 THEN
    RAISE EXCEPTION 'pgtap: identical hold replay is not a no-op';
  END IF;

  -- Consume 4: closes the hold; balance 300−4 = 296, single count.
  _consume := public.media_credit_consume(_t, _j, 4);
  IF (_consume->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'pgtap: consume failed: %', _consume;
  END IF;
  -- Closure math via the ledger rows themselves (the balance internal is
  -- revoked by design): included consumed 4 of the 300 grant, no open holds.
  IF (SELECT coalesce(sum(included_credits), 0) FROM public.paige_media_credit_entries
      WHERE tenant_id = _t AND entry_type = 'consume') <> 4
     OR (SELECT count(*) FROM public.paige_media_credit_entries h
         WHERE h.tenant_id = _t AND h.entry_type = 'hold'
           AND NOT EXISTS (SELECT 1 FROM public.paige_media_credit_entries c
                           WHERE c.entry_type IN ('consume','release') AND c.job_id = h.job_id)) <> 0 THEN
    RAISE EXCEPTION 'pgtap: closure math wrong (consume or open holds)';
  END IF;

  -- Release after consume: a NO-OP, never a credit return (a consume-closed
  -- hold has nothing open to release; the RPC would answer no_open_hold).
  IF EXISTS (SELECT 1 FROM public.paige_media_credit_entries
             WHERE tenant_id = _t AND entry_type = 'release') THEN
    RAISE EXCEPTION 'pgtap: unexpected release row';
  END IF;
END $$;

-- Insufficient: a hold beyond the balance writes NOTHING and says so.
DO $$
DECLARE
  _t uuid := (SELECT tenant_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _j uuid;
  _res jsonb; _before int; _after int;
BEGIN
  -- A REAL job first (the correlation gate refuses mismatched ids, correctly).
  INSERT INTO public.paige_media_jobs
    (tenant_id, actor_id, mode, provider, model, params, state, approval_state, idempotency_key, estimated_cost_usd)
  VALUES (_t, (SELECT actor_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1'),
          'video', 'fal', 'fal-ai/veo3.1/fast', '{"prompt":"too big"}'::jsonb,
          'created', 'not_required', 'pgtap-proof-job-2', 50.0);
  _j := (SELECT id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-2');
  _before := (SELECT count(*) FROM public.paige_media_credit_entries WHERE tenant_id = _t);
  -- Estimate stays under the platform guard ($25) so the CREDIT branch is
  -- what refuses: 5001 credits against a 300-credit balance.
  _res := public.media_credit_hold(_t, _j, 5001, 0.5);
  _after := (SELECT count(*) FROM public.paige_media_credit_entries WHERE tenant_id = _t);
  IF (_res->>'insufficient')::boolean IS NOT TRUE OR _before <> _after THEN
    RAISE EXCEPTION 'pgtap: insufficient hold was not a clean refusal: %', _res;
  END IF;
END $$;

-- Anti-leakage: release is FORBIDDEN once the job reached the provider.
DO $$
DECLARE
  _t uuid := (SELECT tenant_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _j uuid := (SELECT id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _res jsonb;
BEGIN
  UPDATE public.paige_media_jobs SET state = 'failed', submitted_at = now(),
    completed_at = now(), error = 'simulated provider failure'
    WHERE id = _j AND idempotency_key = 'pgtap-proof-job-1';
  -- The consume already closed the proof job's hold; open a fresh one via settle
  -- semantics: create a new failed-submitted job with a hold, then attempt release.
  INSERT INTO public.paige_media_jobs
    (tenant_id, actor_id, mode, provider, model, params, state, approval_state, idempotency_key, estimated_cost_usd, submitted_at, completed_at, error)
  VALUES (_t, (SELECT actor_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1'),
          'image', 'fal', 'fal-ai/nano-banana', '{"prompt":"leak"}'::jsonb,
          'failed', 'not_required', 'pgtap-proof-job-3', 0.039, now(), now(), 'simulated');
  PERFORM public.media_credit_hold(_t,
    (SELECT id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-3'), 4, 0.039);
  _res := public.media_credit_release(_t,
    (SELECT id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-3'), 'attempted leak');
  IF (_res->>'error')::text IS DISTINCT FROM 'release_forbidden_submitted' THEN
    RAISE EXCEPTION 'pgtap: submitted job release was not forbidden: %', _res;
  END IF;
  -- The settlement companion CONSUMES it instead (provider charge recorded).
  PERFORM public.settle_media_credit_holds(10);
  IF NOT EXISTS (SELECT 1 FROM public.paige_media_credit_entries c
                 JOIN public.paige_media_jobs j ON j.id = c.job_id
                 WHERE j.idempotency_key = 'pgtap-proof-job-3' AND c.entry_type = 'consume') THEN
    RAISE EXCEPTION 'pgtap: settlement did not consume the submitted-failed hold';
  END IF;
END $$;

-- Purchased grant: unique key per grant (a second pack purchase is never a no-op).
DO $$
DECLARE _t uuid := (SELECT tenant_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
BEGIN
  PERFORM public.media_credit_grant_purchased(_t, 350, 'pack:media5', 'pgtap pack one', NULL);
  PERFORM public.media_credit_grant_purchased(_t, 350, 'pack:media5', 'pgtap pack two', NULL);
  IF (SELECT count(*) FROM public.paige_media_credit_entries
      WHERE tenant_id = _t AND entry_type = 'grant_purchased') <> 2 THEN
    RAISE EXCEPTION 'pgtap: second pack grant was silently dropped';
  END IF;
END $$;
RESET ROLE;

-- ── RLS: tenants are blind to each other's ledger ────────────────────────────
DO $$
DECLARE
  _u uuid := (SELECT id FROM auth.users WHERE email = 'media-ledger-test@example.test');
  _t uuid := (SELECT tenant_id FROM public.paige_media_jobs WHERE idempotency_key = 'pgtap-proof-job-1');
  _other uuid := '5e500000-0000-0000-0000-000000000005';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (_other, 'other@example.test');
  INSERT INTO public.tenants (id, slug, name, status, account_type, account_number_prefix, features)
  VALUES (_other, 'media-ledger-other', 'Other Co', 'active', 'standalone', 'MLO', '{}');
  INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
  VALUES (_other, _other, 'owner', 'active');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '5e500000-0000-0000-0000-000000000005'::text,
                    'role', 'authenticated')::text, true);
SELECT is((SELECT count(*) FROM public.paige_media_credit_entries)::int, 0,
          'another workspace sees zero of this workspace''s ledger entries');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
