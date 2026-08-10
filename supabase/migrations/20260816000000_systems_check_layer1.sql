-- Systems Check MVP — Layer 1: data model + 10-check registry seed (Owner Trilogy Pillar #1, task #80).
--
-- SCOPE (§13 honest): this migration ships ONLY the schema + the operator-owned check catalog seed.
--   It does NOT build the runner edge functions, the scan orchestrator, or any surface — those are
--   later layers. This is owner-review-gated; nothing here is applied to prod by this session.
--
-- GREENFIELD (verified 2026-08-09): zero `systems_check` code in the repo, zero `%systems_check%`
--   tables on prod (project xygzykjyynhzqytbqnzu). Built from scratch, but EXTENDS existing
--   conventions (never forks): `is_platform_owner()` operator scope, `current_user_tenant_id()`
--   tenant scope, `set_updated_at()` trigger reuse (§18 one home), `paige_departments(slug)` FK
--   (§16 dept ids), `FORCE ROW LEVEL SECURITY`, idempotent create-if-not-exists / create-or-replace —
--   matching the shipped `20260814000000_tenant_revenue_classification.sql`.
--
-- GROUNDING: BRD-MVP-2026-08-08.md §6 (the 10 owner-locked checks) + owner-trilogy-2026-07-26.md
--   Pillar 1 (30-check catalog superset + Check Spec DSL). The 10 seeded here are the launch-blocking
--   MVP core within the 30-check catalog; the schema is shaped so the post-MVP Marketplace Check Spec
--   DSL extends the catalog WITHOUT a schema change (see the `assertion`/`target`/`vertical_playbook_id`
--   forward-design note below).
--
-- OWNER RULINGS (2026-08-09) applied to the 3 previously-blocked checks (#3 social, #4 automation,
--   #10 payment methods) — see the per-row seed comments.
--
-- §9/§51 TENANT ISOLATION: run/finding/baseline are tenant-scoped via `tenant_id = current_user_tenant_id()`.
--   Because that predicate keys on the CALLER's own resolved tenant, a sub-account JWT resolves to ITS
--   OWN tenant_id and can never read the parent agency's rows (§51 ABSOLUTE INVARIANT). The shared
--   catalog (`paige_systems_check_registry`) is operator-authored, tenant-readable, coaching-generic,
--   §2-clean (no credit/funding default anywhere in the seed).

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- assertion.type conceptual set (FORWARD-DESIGN, §35 — DSL runner NOT built here):
--   The post-MVP Marketplace Check Spec DSL describes a check's pass/fail test as `assertion: {type, ...}`.
--   The conceptual set of assertion types the DSL will support (documented so the schema anticipates them):
--     • nl_predicate         — LLM judges a natural-language question over fetched content (see nl_prompt)
--     • regex_match          — a regex must (not) match the target
--     • json_path_expected   — a JSONPath over an API response must equal an expected value
--     • status_code_range    — an HTTP status must fall in a range (uptime/health)
--     • time_under_ms        — a measured latency must be under a threshold (performance)
--     • tenant_baseline_delta — a metric must stay within N σ of the tenant's rolling baseline (§26 memory)
--   The nullable `assertion` (jsonb) + `target` (text) columns below are the home for that spec, so a
--   Playbook author can add a vertical check as DATA (a registry row) rather than a code/schema change.
--   MVP native-seam checks leave `assertion`/`target` NULL and dispatch on `runner_key` instead.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- 1) ── REGISTRY: the shared check catalog (operator-authored, tenant-readable) ─────────────────────
create table if not exists public.paige_systems_check_registry (
  check_id            text primary key,                 -- stable slug, catalog identity
  check_name          text not null,
  domain              text not null
                        check (domain in (
                          'infrastructure','marketing','forms_booking',
                          'comms_deliverability','payments_ops','data_product','vertical_custom')),
  severity            text not null
                        check (severity in ('blocking','high','medium','low')),
  department          text                              -- §16 dept id (paige_departments.slug)
                        references public.paige_departments(slug) on delete set null,
  data_source         text not null
                        check (data_source in (
                          'native_seam','self_hosted_worker','external_vendor','fetch_url','api_call')),
  runner_key          text not null,                    -- what the (later-layer) runner dispatches on
  nl_prompt           text,                             -- nl_predicate question (nullable; MVP data-reads leave null)
  remediation_prompt  text not null,                    -- Paige's fix-draft prompt (§14/§36 hands-on assist)
  -- Forward-design (§35): the general Check Spec DSL home so the Marketplace can extend without a schema change.
  assertion           jsonb,                            -- {type: <assertion.type>, ...} — NULL for MVP native-seam checks
  target              text,                             -- DSL target template (e.g. "{{tenant.intake_form_url}}")
  -- Priority ordering (§36 "one at a time, priority-ordered"): lower number = higher priority; #1 highest.
  priority            int not null default 100,
  mvp_locked          boolean not null default false,
  enabled_by_default  boolean not null default true,
  tier_scope          jsonb not null default '{"agency":true,"solo":true,"sub_account":true}'::jsonb,
  vertical_playbook_id uuid,                            -- null = platform default; set by a Marketplace Playbook install
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.paige_systems_check_registry is
  'Systems Check catalog (Owner Trilogy Pillar 1, task #80). Shared, operator-authored, coaching-generic, §2-clean. Readable by all authenticated tenants; writable by is_platform_owner() only. The `assertion`/`target`/`vertical_playbook_id` columns are the forward-design home for the post-MVP Marketplace Check Spec DSL (extend the catalog as data, not schema).';
comment on column public.paige_systems_check_registry.priority is
  'Lower = higher priority (#1 highest). Drives the §36 one-at-a-time, priority-ordered surfacing. Added to satisfy the BRD 6.1 ordering requirement (judgment call — not in the original column list).';
comment on column public.paige_systems_check_registry.assertion is
  'Forward-design (§35): general Check Spec DSL assertion, {type: nl_predicate|regex_match|json_path_expected|status_code_range|time_under_ms|tenant_baseline_delta, ...}. NULL for MVP native-seam checks (they dispatch on runner_key). No DSL runner is built in this layer.';

create index if not exists paige_systems_check_registry_domain_idx
  on public.paige_systems_check_registry (domain);
create index if not exists paige_systems_check_registry_priority_idx
  on public.paige_systems_check_registry (priority);
create index if not exists paige_systems_check_registry_enabled_idx
  on public.paige_systems_check_registry (enabled_by_default) where enabled_by_default;

drop trigger if exists set_updated_at on public.paige_systems_check_registry;
create trigger set_updated_at before update on public.paige_systems_check_registry
  for each row execute function public.set_updated_at();

-- 2) ── RUN: one Systems Check scan (tenant-scoped) ──────────────────────────────────────────────────
create table if not exists public.paige_systems_check_run (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  scan_flavor   text not null
                  check (scan_flavor in ('onboarding','scheduled','change_triggered')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  check_count   int not null default 0,
  pass_count    int not null default 0,
  fail_count    int not null default 0,
  triggered_by  jsonb,                                  -- {source, user_id, change_ref, ...} audit context
  created_at    timestamptz not null default now()
);

comment on table public.paige_systems_check_run is
  'One Systems Check scan for one tenant. §9/§51 tenant-scoped (tenant sees only its own; is_platform_owner sees all). Three flavors per owner-trilogy Pillar 1: onboarding / scheduled / change_triggered.';

create index if not exists paige_systems_check_run_tenant_idx
  on public.paige_systems_check_run (tenant_id, started_at desc);

-- 3) ── FINDING: per-check result within a run (tenant_id carried for direct RLS) ────────────────────
create table if not exists public.paige_systems_check_finding (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references public.paige_systems_check_run(id) on delete cascade,
  check_id              text not null references public.paige_systems_check_registry(check_id),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,  -- carried for direct RLS (avoids a run join in the policy)
  status                text not null
                          check (status in ('pass','fail','skip','error')),
  severity_at_finding   text
                          check (severity_at_finding in ('blocking','high','medium','low')),
  evidence              jsonb,                          -- what the runner observed (§13 real evidence)
  paige_interpretation  text,                           -- Paige's plain-language read of the finding (§34 intelligence)
  paige_drafted_fix     jsonb,                          -- the drafted remediation (§36 draft-first / §16 confirm-lane)
  department_id         text                            -- §16 owning dept (denormalized from registry.department at finding time)
                          references public.paige_departments(slug) on delete set null,
  resolved_at           timestamptz,
  resolution            text
                          check (resolution in ('approved','rejected','deferred')),
  resolution_action_id  uuid,                           -- links to paige_actions when the fix routes to the action bus (§8)
  created_at            timestamptz not null default now()
);

comment on table public.paige_systems_check_finding is
  'One check result within a run. tenant_id is CARRIED (not only reachable via run_id) so RLS gates directly without a join (§9). department_id denormalized from the registry at finding time for §16 routing.';

create index if not exists paige_systems_check_finding_run_idx
  on public.paige_systems_check_finding (run_id);
create index if not exists paige_systems_check_finding_tenant_idx
  on public.paige_systems_check_finding (tenant_id, created_at desc);
create index if not exists paige_systems_check_finding_open_idx
  on public.paige_systems_check_finding (tenant_id, status) where status = 'fail' and resolved_at is null;

-- 4) ── BASELINE: per-tenant, per-check rolling metric baseline (§26 memory / anomaly detection) ─────
create table if not exists public.paige_systems_check_baseline (
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  check_id            text not null references public.paige_systems_check_registry(check_id),
  metric_name         text not null,
  baseline_value      numeric,
  baseline_stdev      numeric,
  rolling_window_days int not null default 30,
  updated_at          timestamptz not null default now(),
  primary key (tenant_id, check_id, metric_name)
);

comment on table public.paige_systems_check_baseline is
  'Per-tenant rolling baseline (value + stdev) per check metric, for the tenant_baseline_delta assertion (§26 memory). §9/§51 tenant-scoped. Populated by later-layer scans; empty at Layer 1.';

drop trigger if exists set_updated_at on public.paige_systems_check_baseline;
create trigger set_updated_at before update on public.paige_systems_check_baseline
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- RLS (§9/§51) — FORCE on every table.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Registry: readable by ALL authenticated tenants (shared catalog); writable by is_platform_owner() only.
alter table public.paige_systems_check_registry enable row level security;
alter table public.paige_systems_check_registry force row level security;

drop policy if exists scr_read_all on public.paige_systems_check_registry;
create policy scr_read_all on public.paige_systems_check_registry
  for select to authenticated using (true);

drop policy if exists scr_owner_insert on public.paige_systems_check_registry;
create policy scr_owner_insert on public.paige_systems_check_registry
  for insert to authenticated with check (public.is_platform_owner());

drop policy if exists scr_owner_update on public.paige_systems_check_registry;
create policy scr_owner_update on public.paige_systems_check_registry
  for update to authenticated using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists scr_owner_delete on public.paige_systems_check_registry;
create policy scr_owner_delete on public.paige_systems_check_registry
  for delete to authenticated using (public.is_platform_owner());

-- Run / Finding / Baseline: tenant sees ONLY its own rows; is_platform_owner() sees all.
-- §51: `tenant_id = current_user_tenant_id()` keys on the CALLER's own resolved tenant — a sub-account
--       JWT resolves to its OWN tenant_id and can never read the parent agency's rows.
alter table public.paige_systems_check_run enable row level security;
alter table public.paige_systems_check_run force row level security;
drop policy if exists scrun_tenant_all on public.paige_systems_check_run;
create policy scrun_tenant_all on public.paige_systems_check_run
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_platform_owner())
  with check (tenant_id = public.current_user_tenant_id() or public.is_platform_owner());

alter table public.paige_systems_check_finding enable row level security;
alter table public.paige_systems_check_finding force row level security;
drop policy if exists scfind_tenant_all on public.paige_systems_check_finding;
create policy scfind_tenant_all on public.paige_systems_check_finding
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_platform_owner())
  with check (tenant_id = public.current_user_tenant_id() or public.is_platform_owner());

alter table public.paige_systems_check_baseline enable row level security;
alter table public.paige_systems_check_baseline force row level security;
drop policy if exists scbase_tenant_all on public.paige_systems_check_baseline;
create policy scbase_tenant_all on public.paige_systems_check_baseline
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_platform_owner())
  with check (tenant_id = public.current_user_tenant_id() or public.is_platform_owner());

-- Grants (RLS still gates every row; service role bypasses RLS for the later-layer runner edge fns).
grant select, insert, update, delete on public.paige_systems_check_registry to authenticated;
grant select, insert, update, delete on public.paige_systems_check_run to authenticated;
grant select, insert, update, delete on public.paige_systems_check_finding to authenticated;
grant select, insert, update, delete on public.paige_systems_check_baseline to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- SEED — the 10 MVP-locked checks (mvp_locked=true, enabled_by_default=true, all tiers, §2-clean).
--   Priority order per BRD 6.1: #1 comms highest. remediation_prompt is coaching-generic — NO credit/
--   funding default anywhere (§2). Idempotent on check_id.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.paige_systems_check_registry
  (check_id, check_name, domain, severity, department, data_source, runner_key, nl_prompt,
   remediation_prompt, priority, mvp_locked, enabled_by_default)
values
  -- #1 — Comms configured (email + SMS + business phone). Highest priority: unblocks the core use case.
  ('comms_configured',
   'Comms configured across the board',
   'comms_deliverability', 'blocking', 'technology_automation', 'native_seam', 'comms_configured',
   null,
   'Help {{tenant.business_name}} get outbound comms live end-to-end: confirm a verified email sending identity (from-name + reply-to), an SMS sender, and a registered business phone number. Draft the sender setup and walk through the verification steps so email and SMS deliver reliably. Do this hands-on — set it up with them, do not hand over a checklist.',
   1, true, true),

  -- #2 — Website connected/detected; if none, offer to build one in Vibe Studio.
  ('website_connected',
   'Website connected or detected',
   'marketing', 'high', 'marketing', 'native_seam', 'website_connected',
   null,
   'Check whether {{tenant.business_name}} has a website connected. If not, propose building one in the Vibe Studio in one session and offer to draft the first landing page from what you already know about their business. If they have an external site, help them connect it so Paige can monitor it.',
   2, true, true),

  -- #3 — Social accounts. OWNER-RULED 2026-08-09: CAPTURE-ONLY. A "do you have social handles?" data
  --      capture, NO live verification. `runner_key='social_handles_captured'`. A real social connector
  --      is POST-MVP (not built here).
  ('social_accounts_connected',
   'Social accounts connected',
   'marketing', 'medium', 'marketing', 'native_seam', 'social_handles_captured',
   'Does the business have social media handles (Instagram, Facebook, LinkedIn, TikTok, X) on record?',
   'Ask {{tenant.business_name}} for their social handles and save them to the business profile so Paige can reference them for content and campaigns. This is a capture step only for MVP — connecting the accounts for live posting/monitoring comes later.',
   3, true, true),

  -- #4 — Automation wired. OWNER-RULED 2026-08-09: EXTERNAL-DETECT-ONLY. "Do you have an external
  --      workflow/automation solution wired?" — works for ANY Zapier/Make/n8n/Retool.
  --      `runner_key='external_automation_detected'`. NOTE: §118 per-tenant n8n widening is a SEPARATE
  --      task, deliberately NOT touched here.
  ('automation_wired',
   'External automation solution wired',
   'payments_ops', 'medium', 'technology_automation', 'native_seam', 'external_automation_detected',
   'Does the business have an external workflow/automation tool connected (Zapier, Make, n8n, Retool, or similar)?',
   'Ask {{tenant.business_name}} whether they run an external automation tool (Zapier, Make, n8n, Retool). Record what they use so Paige knows what already fires, and propose which repetitive follow-ups Paige can take over natively.',
   4, true, true),

  -- #5 — Company info populated.
  ('company_info_populated',
   'Company info populated',
   'data_product', 'high', 'operations_pmo', 'native_seam', 'company_info_populated',
   null,
   'Review {{tenant.business_name}}''s company profile (legal name, address, industry, description, logo, hours). Draft the missing fields from what you already know and confirm them with the tenant so every downstream asset renders with correct business details.',
   5, true, true),

  -- #6 — Any customers in CRM.
  ('crm_has_customers',
   'Customers present in CRM',
   'data_product', 'high', 'sales', 'native_seam', 'crm_has_customers',
   null,
   'Check whether {{tenant.business_name}} has any contacts in the CRM. If empty, offer to import their existing customer list (CSV or paste) or set up a lead-capture form so new contacts flow in automatically.',
   6, true, true),

  -- #7 — Sales pipeline scoped + configured.
  ('sales_pipeline_configured',
   'Sales pipeline scoped and configured',
   'data_product', 'medium', 'sales', 'native_seam', 'sales_pipeline_configured',
   null,
   'Check whether {{tenant.business_name}} has a sales pipeline with stages configured. If not, propose a pipeline shaped to how they actually sell and draft the stages for their approval so deals can be tracked and moved.',
   7, true, true),

  -- #8 — Sales revenue tracking configured. data_source=native_seam. runner_key reads the #31
  --      operator_revenue_integrity_audit RPC. DEPENDENCY (§13): this runner depends on task #31
  --      (operator_revenue_integrity_audit) MERGING first; until then the runner returns skip/needs_config,
  --      never a fabricated pass, and must not present dashboard numbers as real (BRD §6 check 8 / §13).
  ('revenue_tracking_configured',
   'Sales revenue tracking configured',
   'payments_ops', 'high', 'finance', 'native_seam', 'revenue_tracking_configured',
   null,
   'Check whether {{tenant.business_name}}''s revenue tracking is wired and reconciled. If revenue data is missing or unreconciled, walk them through connecting their processor and confirm the numbers reconcile before presenting any revenue figure as real.',
   8, true, true),

  -- #9 — Payment processor set up (Stripe Connect onboarded).
  ('payment_processor_connected',
   'Payment processor set up',
   'payments_ops', 'blocking', 'finance', 'native_seam', 'payment_processor_connected',
   null,
   'Check whether {{tenant.business_name}} has completed payment processor onboarding (Stripe Connect). If not, walk them through the onboarding so they can accept payments from their own clients — Paige facilitates the setup; the tenant remains merchant of record (§38).',
   9, true, true),

  -- #10 — Payment method options. OWNER-RULED 2026-08-09: STRIPE-NATIVE READ. data_source=external_vendor.
  --       `runner_key='stripe_payment_methods_read'` — reads the tenant's connected Stripe account's
  --       accepted methods. Configure-in-Paige is POST-MVP (not built here).
  ('payment_method_options',
   'Payment method options configured',
   'payments_ops', 'low', 'finance', 'external_vendor', 'stripe_payment_methods_read',
   null,
   'Read the payment methods enabled on {{tenant.business_name}}''s connected Stripe account (cards, wallets, bank debits) and report what customers can currently pay with. If key methods are off, explain the tradeoffs and offer to note the desired set — turning them on inside Paige comes later.',
   10, true, true)
on conflict (check_id) do nothing;

commit;
