-- Systems Check MVP — Layer 3: OPERATOR-SCOPE checks (Wave S3, Owner Trilogy Pillar #1, task #80).
--
-- WHAT THIS ADDS (all additive/idempotent; the tenant path is left byte-identical, §37):
--   (a) paige_systems_check_registry.scope ('tenant'|'operator', default 'tenant') — the seam that keeps
--       operator checks OUT of tenant scans and vice-versa. The 10 L1/L2 rows are all TENANT checks and
--       default to 'tenant' automatically; the core now filters `.eq("scope", scope)` so a tenant scan
--       returns EXACTLY the 10 tenant rows and an operator scan returns EXACTLY the operator rows.
--   (b) paige_systems_check_run.tenant_id + paige_systems_check_finding.tenant_id made NULLABLE — an
--       operator (tenant-less) run/finding carries tenant_id = NULL. The FK to tenants is KEPT (a null FK
--       value is unenforced, so it is valid); the RLS is tightened so a NON-owner still cannot write a
--       null / foreign-tenant row, while an operator (is_platform_operator) can write a null-tenant
--       operator row. (Reads: the existing tenant/owner branch is preserved; a null-tenant operator row
--       is added for is_platform_operator so a platform_admin operator can see operator findings.)
--   (c) The Wave-S3 operator-scope check catalog (scope='operator'): 8 edge-drivable-now + 2 honestly
--       DEFERRED (git-tag drift) rows. Coaching-generic, §2-clean, priority-ordered §36, routed to
--       technology_automation / operations_pmo (§16).
--   (d) Two operator-only SECURITY DEFINER RPCs the runner reads: operator_db_health_snapshot() (#1 prod
--       DB health via pg_stat) and operator_rls_coverage_audit() (#4 RLS coverage via pg_catalog). Both
--       gated `is_platform_operator() OR service_role` (§53 operator tier; service_role is the runner's
--       server-side client — auth.uid() is null there, so is_platform_operator() alone would 42501 the
--       runner). A browser operator OR Paige can call them too (§10 Paige-governable).
--
-- §9/§51/§53: operator scope is INTENTIONALLY tenant-less and platform-global. It is gated by
--   is_platform_operator() (super_admin OR platform_admin, §53) at the edge fn + the RPCs; a TENANT JWT
--   can never write or read a null-tenant operator row (RLS below), and an operator scan never writes a
--   tenant_id (the core forces tenant_id = NULL on operator writes). §588: the operator identity is the
--   VERIFIED JWT (or the service/cron context), never a request body.
--
-- §13 HONESTY: the git-tag drift checks (#2 migration-drift, #3 edge-fn-drift) CANNOT be driven from a
--   Deno edge function (an edge fn cannot read the db-live/edge-live git tags or shell out to git). They
--   are seeded as real registry rows but with data_source='self_hosted_worker' + a runner that returns
--   'skip' (needs_config) with the real reason — NEVER a fabricated git read. A CI/GitHub-Action reader
--   is the later slice (deploy-migrations.yml / deploy-edge-functions.yml already move those tags).
--
-- §2: no credit/funding/lender vocabulary anywhere in the operator seed. Operator infra checks (DB, RLS,
--   platform Stripe-webhook health, Twilio master health, LLM failover, doctrine binding, domain/SSL,
--   cross-tenant canary) are Paige's OWN-rails operations (§38), never a tenant-facing finance vertical
--   and never shown to any tenant.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) registry.scope — the tenant/operator seam.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.paige_systems_check_registry
  add column if not exists scope text not null default 'tenant';

alter table public.paige_systems_check_registry
  drop constraint if exists paige_systems_check_registry_scope_chk;
alter table public.paige_systems_check_registry
  add constraint paige_systems_check_registry_scope_chk
  check (scope in ('tenant','operator'));

comment on column public.paige_systems_check_registry.scope is
  'Who this check is for (§9/§51/§53): ''tenant'' = a tenant-scoped check (the L1/L2 default 10), ''operator'' = a platform-operator (God/platform_admin) infra check that runs tenant-less. The runner core filters `.eq("scope", scope)` so tenant scans and operator scans never mix catalogs.';

create index if not exists paige_systems_check_registry_scope_idx
  on public.paige_systems_check_registry (scope, priority);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) run/finding.tenant_id NULLABLE (operator runs have no tenant). FK kept (null FK is unenforced).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.paige_systems_check_run   alter column tenant_id drop not null;
alter table public.paige_systems_check_finding alter column tenant_id drop not null;

comment on column public.paige_systems_check_run.tenant_id is
  'Owning tenant, or NULL for an OPERATOR-scope run (§53 platform-global). Tenant runs set this to the server-resolved tenant; operator runs set NULL. RLS gates a null-tenant row to is_platform_operator() only.';
comment on column public.paige_systems_check_finding.tenant_id is
  'Owning tenant, or NULL for an OPERATOR-scope finding (§53). Carried (not only via run_id) so RLS gates directly. A null-tenant operator finding is readable/writable only by is_platform_operator().';

-- RLS: preserve the tenant/owner branch EXACTLY (§37 — do not regress the tenant path); ADD a
--   null-tenant operator branch so is_platform_operator() (super_admin OR platform_admin) can read/write
--   operator rows. §53: we ADD is_platform_operator() as a distinct branch — we do NOT widen the frozen
--   is_platform_owner() in place. A tenant caller writing tenant_id=NULL fails every branch:
--     • `NULL = current_user_tenant_id()`  → NULL (not TRUE)  → blocked
--     • `is_platform_owner()`              → false for a tenant → blocked
--     • `tenant_id IS NULL AND is_platform_operator()` → is_platform_operator() false for a tenant → blocked
--   The service-role runner bypasses RLS entirely; these policies gate only direct authenticated access.
drop policy if exists scrun_tenant_all on public.paige_systems_check_run;
create policy scrun_tenant_all on public.paige_systems_check_run
  for all to authenticated
  using (
    tenant_id = public.current_user_tenant_id()
    or public.is_platform_owner()
    or (tenant_id is null and public.is_platform_operator())
  )
  with check (
    tenant_id = public.current_user_tenant_id()
    or public.is_platform_owner()
    or (tenant_id is null and public.is_platform_operator())
  );

drop policy if exists scfind_tenant_all on public.paige_systems_check_finding;
create policy scfind_tenant_all on public.paige_systems_check_finding
  for all to authenticated
  using (
    tenant_id = public.current_user_tenant_id()
    or public.is_platform_owner()
    or (tenant_id is null and public.is_platform_operator())
  )
  with check (
    tenant_id = public.current_user_tenant_id()
    or public.is_platform_owner()
    or (tenant_id is null and public.is_platform_operator())
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Operator-only SECURITY DEFINER RPCs (#1 DB health, #4 RLS coverage). Gate: is_platform_operator()
--     OR the service-role runner. RAISE 42501 on a gate miss — never a silent empty result (§13).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- #1 — prod DB health snapshot from pg_stat. PII-free aggregates only. `healthy` is a boolean the runner
--      reads; the raw metrics are returned so the operator surface can render detail. auth.role() =
--      'service_role' lets the tenant-less runner client through (its auth.uid() is null).
create or replace function public.operator_db_health_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max_conn      int;
  v_conns         int;
  v_active        int;
  v_idle          int;
  v_idle_in_txn   int;
  v_longest_sec   numeric;
  v_db_size       bigint;
  v_hit           bigint;
  v_read          bigint;
  v_hit_ratio     numeric;
  v_deadlocks     bigint;
  v_healthy       boolean;
begin
  if not (public.is_platform_operator() or auth.role() = 'service_role') then
    raise exception 'operator_scope_forbidden' using errcode = '42501';
  end if;

  v_max_conn := coalesce(nullif(current_setting('max_connections', true), '')::int, 0);

  select
    count(*),
    count(*) filter (where state = 'active'),
    count(*) filter (where state = 'idle'),
    count(*) filter (where state = 'idle in transaction'),
    coalesce(max(extract(epoch from (now() - query_start)))
             filter (where state = 'active' and query_start is not null), 0)
  into v_conns, v_active, v_idle, v_idle_in_txn, v_longest_sec
  from pg_catalog.pg_stat_activity
  where datname = current_database();

  v_db_size := pg_catalog.pg_database_size(current_database());

  select coalesce(sum(blks_hit), 0), coalesce(sum(blks_read), 0), coalesce(sum(deadlocks), 0)
  into v_hit, v_read, v_deadlocks
  from pg_catalog.pg_stat_database
  where datname = current_database();

  v_hit_ratio := case when (v_hit + v_read) > 0 then round(v_hit::numeric / (v_hit + v_read), 4) else null end;

  -- Healthy iff: connection headroom (<90% of max), no runaway active query (>300s), and — only when
  -- there is enough read traffic to judge — a cache hit ratio above 0.90. A pre-traffic DB with a NULL
  -- hit ratio is NOT failed on that axis (§13 — don't fabricate a verdict from no data).
  v_healthy :=
       (v_max_conn = 0 or v_conns < (v_max_conn * 0.9))
   and (v_longest_sec < 300)
   and (v_hit_ratio is null or (v_hit + v_read) < 10000 or v_hit_ratio >= 0.90);

  return jsonb_build_object(
    'healthy',              v_healthy,
    'max_connections',      v_max_conn,
    'connections',          v_conns,
    'active',               v_active,
    'idle',                 v_idle,
    'idle_in_transaction',  v_idle_in_txn,
    'longest_active_seconds', round(v_longest_sec, 1),
    'db_size_bytes',        v_db_size,
    'cache_hit_ratio',      v_hit_ratio,
    'deadlocks',            v_deadlocks,
    'measured_at',          now()
  );
end;
$$;

revoke all on function public.operator_db_health_snapshot() from public, anon;
grant execute on function public.operator_db_health_snapshot() to authenticated, service_role;

comment on function public.operator_db_health_snapshot() is
  '§53 operator-only (is_platform_operator() OR service_role). PII-free prod DB health from pg_stat: connections vs max, longest active query, db size, cache hit ratio, deadlocks + a `healthy` boolean. Read by the Systems Check operator runner (#1) and callable by a browser operator / Paige (§10).';

-- #4 — RLS coverage audit over public base tables from pg_catalog. Returns counts + the (capped) list of
--      public base tables with NO row-level security enabled, and those with RLS enabled but zero
--      policies (an RLS table with no policy denies all authenticated access — often a real gap).
create or replace function public.operator_rls_coverage_audit()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total       int;
  v_rls_on      int;
  v_forced      int;
  v_no_rls      text[];
  v_rls_no_pol  text[];
  v_coverage    numeric;
begin
  if not (public.is_platform_operator() or auth.role() = 'service_role') then
    raise exception 'operator_scope_forbidden' using errcode = '42501';
  end if;

  with base as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'                       -- ordinary base tables only (not views/partitions/seq)
      and c.relname not like 'pg_%'
  ),
  pol as (
    select pc.oid, count(p.polname) as npol
    from base pc
    left join pg_catalog.pg_policy p on p.polrelid = pc.oid
    group by pc.oid
  )
  select
    (select count(*) from base),
    (select count(*) from base where relrowsecurity),
    (select count(*) from base where relforcerowsecurity),
    (select coalesce(array_agg(relname order by relname), '{}')
       from base where not relrowsecurity),
    (select coalesce(array_agg(b.relname order by b.relname), '{}')
       from base b join pol on pol.oid = b.oid
      where b.relrowsecurity and pol.npol = 0)
  into v_total, v_rls_on, v_forced, v_no_rls, v_rls_no_pol;

  v_coverage := case when v_total > 0 then round(v_rls_on::numeric / v_total, 4) else null end;

  return jsonb_build_object(
    'total_tables',            v_total,
    'rls_enabled',             v_rls_on,
    'rls_forced',              v_forced,
    'coverage_ratio',          v_coverage,
    'tables_without_rls_count', coalesce(array_length(v_no_rls, 1), 0),
    'tables_without_rls',      (select coalesce(array_agg(t), '{}') from unnest(v_no_rls) with ordinality u(t, ord) where ord <= 50),
    'tables_rls_no_policy_count', coalesce(array_length(v_rls_no_pol, 1), 0),
    'tables_rls_no_policy',    (select coalesce(array_agg(t), '{}') from unnest(v_rls_no_pol) with ordinality u(t, ord) where ord <= 50),
    'measured_at',             now()
  );
end;
$$;

revoke all on function public.operator_rls_coverage_audit() from public, anon;
grant execute on function public.operator_rls_coverage_audit() to authenticated, service_role;

comment on function public.operator_rls_coverage_audit() is
  '§53 operator-only (is_platform_operator() OR service_role). RLS coverage over public base tables from pg_catalog: total, rls_enabled, rls_forced, coverage_ratio, and the capped lists of tables WITHOUT RLS and tables with RLS-but-no-policy. Read by the Systems Check operator runner (#4); callable by a browser operator / Paige (§10).';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) SEED — the Wave-S3 operator-scope catalog (scope='operator'). Priority-ordered §36 (security first).
--     department ∈ {technology_automation, operations_pmo} (§16). remediation_prompt is OPERATOR voice —
--     it carries NO {{tenant.business_name}} token (there is no tenant); the core resolves it verbatim
--     and stores it as the operator finding's drafted remediation guidance (§16 draft-first). §2-clean.
--     Idempotent on check_id.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.paige_systems_check_registry
  (check_id, check_name, domain, severity, department, data_source, runner_key, nl_prompt,
   remediation_prompt, priority, scope, mvp_locked, enabled_by_default)
values
  -- #10 — cross-tenant leak canary (security, highest). Reads the latest security_canary_runs results.
  ('operator_cross_tenant_canary',
   'Cross-tenant leak canary',
   'infrastructure', 'blocking', 'technology_automation', 'native_seam', 'operator_cross_tenant_canary',
   null,
   'The security canary detected an anonymous caller reading restricted/cross-tenant columns. Treat this as a P0: review the flagged tables'' RLS policies and column GRANTs, close the leak, and re-run the canary to confirm it passes before anything else ships.',
   1, 'operator', true, true),

  -- #4 — RLS coverage audit. Reads operator_rls_coverage_audit().
  ('operator_rls_coverage',
   'RLS coverage across public tables',
   'infrastructure', 'blocking', 'technology_automation', 'native_seam', 'operator_rls_coverage',
   null,
   'One or more public base tables are missing row-level security (or have RLS enabled but no policy). Enable RLS and author the correct tenant/operator policies for each flagged table so no table is silently world-readable or fully locked out. Verify each with a per-tier check (§51).',
   2, 'operator', true, true),

  -- #1 — prod DB health. Reads operator_db_health_snapshot().
  ('operator_db_health',
   'Production database health',
   'infrastructure', 'blocking', 'operations_pmo', 'native_seam', 'operator_db_health',
   null,
   'Production database health is degraded (connection pressure, a long-running query, low cache hit ratio, or deadlocks). Investigate the live pg_stat metrics, kill or tune the offending query, and confirm connection headroom and cache hit ratio return to healthy before the next scan.',
   3, 'operator', true, true),

  -- #5 — platform Stripe webhook health. Reads stripe_event_log + webhook_event_log.
  ('operator_stripe_webhook_health',
   'Platform Stripe webhook health',
   'infrastructure', 'high', 'operations_pmo', 'native_seam', 'operator_stripe_webhook_health',
   null,
   'The platform Stripe webhook is unhealthy: recent events are unprocessed or inbound webhook deliveries are failing. Check the stripe-webhook function logs, confirm the signing secret and endpoint are correct, replay any missed events, and confirm new events process cleanly.',
   4, 'operator', true, true),

  -- #8 — LLM failover health. Reads paige_llm_trace.
  ('operator_llm_failover',
   'LLM provider failover health',
   'infrastructure', 'high', 'technology_automation', 'native_seam', 'operator_llm_failover',
   null,
   'Paige''s LLM calls are erroring or needs-config at an elevated rate across providers. Check the model router keys and per-provider status, confirm the failover chain routes around the failing provider, and clear the error/needs-config backlog so generations succeed.',
   5, 'operator', true, true),

  -- #6 — Twilio master account health. Live-probes the master account with masterCreds().
  ('operator_twilio_health',
   'Twilio master account health',
   'infrastructure', 'high', 'technology_automation', 'native_seam', 'operator_twilio_health',
   null,
   'The platform Twilio master account is not reachable or its credentials are rejected. Confirm the master account SID and API-Key trio are set and valid in edge secrets, verify the account is active and funded, and re-probe so platform SMS and voice can send.',
   6, 'operator', true, true),

  -- #9 — doctrine binding. Reads user_roles (super_admin) + paige_owner_memory (operator briefing).
  ('operator_doctrine_binding',
   'Operator doctrine binding',
   'infrastructure', 'high', 'operations_pmo', 'native_seam', 'operator_doctrine_binding',
   null,
   'The operator governance binding is incomplete: either the super_admin (God) account is missing/duplicated (§53) or the operator has no seeded briefing memory (§52). Restore exactly one super_admin and seed the operator briefing so Paige opens every operator session already briefed.',
   7, 'operator', true, true),

  -- #7 — domain/SSL health on the marketing domain. Net-new fetch/TLS probe in the runner.
  ('operator_domain_ssl',
   'Domain and SSL health',
   'infrastructure', 'high', 'operations_pmo', 'fetch_url', 'operator_domain_ssl',
   null,
   'The platform domain is not serving over HTTPS cleanly (the TLS handshake failed, the certificate is invalid/expired, or the site returned an error status). Check DNS, the certificate, and the host so the public domain resolves securely, then re-probe.',
   8, 'operator', true, true),

  -- #2 — migration drift. DEFERRED (§13): compares the db-live git tag against HEAD; an edge fn cannot
  --      read git. Seeded as a real row; runner returns skip/needs_config with the honest reason.
  ('operator_migration_drift',
   'Database migration drift',
   'infrastructure', 'medium', 'technology_automation', 'self_hosted_worker', 'operator_migration_drift',
   null,
   'Migrations may be ahead of what is applied on prod. This check needs the CI migration-drift reader (deploy-migrations.yml moves the db-live tag) — an edge function cannot read git. Confirm `git diff db-live..HEAD -- supabase/migrations/**` is empty and that schema_migrations on prod includes every merged version (§32).',
   9, 'operator', true, true),

  -- #3 — edge-function drift. DEFERRED (§13): reads the edge-live git tag; an edge fn cannot read git.
  ('operator_edge_drift',
   'Edge function drift',
   'infrastructure', 'medium', 'technology_automation', 'self_hosted_worker', 'operator_edge_drift',
   null,
   'Edge functions may be ahead of prod. This check needs the CI edge-drift reader (deploy-edge-functions.yml moves the edge-live tag) — an edge function cannot read git. Run `/edge-drift` (edge-live..HEAD) and confirm zero drift; on main with CI healthy it is zero (§24).',
   10, 'operator', true, true)
on conflict (check_id) do nothing;

-- §10 config-as-data: the domain/SSL probe target lives on the registry row so an operator can repoint it
-- without a code change. The runner falls back to the platform domain when this is null, so this is a
-- convenience seed, not a dependency. Idempotent.
update public.paige_systems_check_registry
   set target = 'https://paigeagent.ai', updated_at = now()
 where check_id = 'operator_domain_ssl' and target is distinct from 'https://paigeagent.ai';

commit;
