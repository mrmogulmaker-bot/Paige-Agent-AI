create table if not exists public.paige_subagents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text not null,
  description text not null,
  runtime text not null check (runtime in ('local','langgraph')),
  edge_function text,
  langgraph_graph text,
  triggers text[] not null default '{}',
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  requires_role text[] not null default '{}',
  display_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.paige_subagents to authenticated;
grant all on public.paige_subagents to service_role;

alter table public.paige_subagents enable row level security;

create policy "Admins manage subagents" on public.paige_subagents
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Authenticated read enabled subagents" on public.paige_subagents
  for select to authenticated
  using (enabled = true);

create table if not exists public.paige_subagent_invocations (
  id uuid primary key default gen_random_uuid(),
  subagent_slug text not null,
  invoked_by uuid references auth.users(id) on delete set null,
  contact_id uuid,
  conversation_id uuid,
  input jsonb,
  output jsonb,
  status text not null default 'pending' check (status in ('pending','succeeded','failed','dispatched')),
  error text,
  latency_ms int,
  langgraph_run_id text,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.paige_subagent_invocations to authenticated;
grant all on public.paige_subagent_invocations to service_role;

alter table public.paige_subagent_invocations enable row level security;

create policy "Admins read all invocations" on public.paige_subagent_invocations
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Users read their own invocations" on public.paige_subagent_invocations
  for select to authenticated
  using (invoked_by = auth.uid());

create policy "Service role full access invocations" on public.paige_subagent_invocations
  for all to service_role using (true) with check (true);

create index if not exists idx_subagent_inv_slug on public.paige_subagent_invocations(subagent_slug, created_at desc);
create index if not exists idx_subagent_inv_contact on public.paige_subagent_invocations(contact_id) where contact_id is not null;

insert into public.paige_subagents (slug, name, domain, description, runtime, edge_function, langgraph_graph, triggers, display_order) values
('fundability-diagnostician', 'Fundability Diagnostician', 'BUILD-to-FUND', 'Maps a client record against the BTF Phase 0/1/2/3 checklist and Data Consistency 7-channel standard. Returns specific missing items per phase.', 'local', 'subagent-fundability', null, array['what am I missing','am I ready to be funded','where am I in the program','fundability check','btf checklist'], 1),
('data-consistency-auditor', 'Data Consistency Auditor', 'Compliance Infrastructure', 'Crawls SOS, IRS, bank listings, 411, Google, Yelp, LexisNexis to verify exact-match name/address/phone across all 7 channels.', 'langgraph', null, 'data_consistency_audit_v1', array['existing entity','data mismatch','address mismatch','sos check','411 listing','google business listing'], 2),
('legal-compliance-reviewer', 'Legal & Compliance Reviewer', 'Compliance', 'Reviews drafts and recommendations against FCRA, CROA, GLBA, FDCPA. Routes anything sensitive to Approvals Hub.', 'local', 'subagent-compliance', null, array['can paige say this','compliance check','dispute language','entity classification','legal review'], 3),
('business-credit-strategist', 'Business Credit Strategist', 'STACK Phase', 'Owns Tier 1 to 4 sequencing, vendor/retail/financial tradeline selection, PAYDEX and Intelliscore trajectory.', 'local', 'subagent-stack-strategist', null, array['what tradeline next','should I open','business credit card','vendor tradeline','paydex'], 4),
('funding-path-architect', 'Funding Path Architect', 'FUND Phase', 'Determines PG / EIN-only / Combo path and matches client to lender bureau preferences for the next application.', 'local', 'subagent-funding-path', null, array['which lender','should I apply','how much can I get','pg or ein only','funding path'], 5),
('financial-research', 'Financial Research Agent', 'Market Data', 'Pulls current rates, lender product changes, SBA updates via Firecrawl + cached economic rates.', 'langgraph', null, 'financial_research_v1', array['current rate','sba update','lender changed','rate today'], 6),
('market-research', 'Market & Competitive Research', 'Industry Intel', 'NAICS risk lookup, industry comps, lender appetite by vertical.', 'langgraph', null, 'market_research_v1', array['naics','industry funding','competitor','vertical'], 7),
('content-outreach-drafter', 'Content & Outreach Drafter', 'Comms', 'Drafts member-facing emails, SMS, and social posts. Routes to Approvals.', 'local', 'subagent-content-drafter', null, array['draft email','write a message','social post','reply to'], 8),
('intake-concierge', 'Onboarding/Intake Concierge', 'Phase 0 Intake', 'Runs the Phase 0 intake conversation and captures structured fields against the client record.', 'local', 'subagent-intake-concierge', null, array['just enrolled','start intake','phase 0','onboarding'], 9),
('sales-pipeline', 'Sales/Pipeline Agent', 'Sales Ops', 'BTF enrollment follow-ups, pipeline hygiene, surfaces stale leads to Antonio.', 'local', 'subagent-sales-pipeline', null, array['follow up','pipeline','stale lead','enrollment status'], 10),
('coach-copilot', 'Coach Copilot', 'Coach Console', 'Assignment-aware helper for coaches inside the admin console.', 'local', 'subagent-coach-copilot', null, array['my clients','coach view','my book','assigned to me'], 11)
on conflict (slug) do update set
  name = excluded.name,
  domain = excluded.domain,
  description = excluded.description,
  runtime = excluded.runtime,
  edge_function = excluded.edge_function,
  langgraph_graph = excluded.langgraph_graph,
  triggers = excluded.triggers,
  display_order = excluded.display_order,
  updated_at = now();