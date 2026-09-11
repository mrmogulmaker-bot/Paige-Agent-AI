-- =============================================================================
-- #1140 — Conversations Intelligence: labels, classification, inbox management.
--
-- The "Paige manages 90% of the inbox" piece. Per-tenant labels, message-label
-- joins, and the classification queue. The triage specialist (CURA's domain)
-- processes inbound on a cron, applies labels, and files actions.
--
-- Tables:
--   paige_conversation_labels  — per-tenant label definitions (name, color, auto-rule)
--   paige_message_labels       — join: which messages carry which labels
--
-- RLS: tenant owner/coach read+write on labels; message labels follow the
-- message's tenant scope (the join is keyed by message_id + label_id).
-- =============================================================================

create table if not exists public.paige_conversation_labels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  slug        text not null,
  color       text not null default 'var(--violet)',
  description text,
  -- Auto-rule: {"when_classified": ["question","at_risk"], "when_subject_contains": ["pricing"]}
  auto_rule   jsonb not null default '{}'::jsonb,
  is_system   boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(tenant_id, slug)
);

create table if not exists public.paige_message_labels (
  message_id  uuid not null references public.messages(id) on delete cascade,
  label_id    uuid not null references public.paige_conversation_labels(id) on delete cascade,
  applied_by  text not null default 'auto' check (applied_by in ('auto','paige','owner')),
  applied_at  timestamptz not null default now(),
  primary key (message_id, label_id)
);

create index if not exists idx_pcl_tenant on public.paige_conversation_labels(tenant_id);
create index if not exists idx_pml_label on public.paige_message_labels(label_id);
create index if not exists idx_pml_message on public.paige_message_labels(message_id);

alter table public.paige_conversation_labels enable row level security;
alter table public.paige_message_labels enable row level security;

grant select on public.paige_conversation_labels to authenticated;
grant all on public.paige_conversation_labels to service_role;
grant select on public.paige_message_labels to authenticated;
grant all on public.paige_message_labels to service_role;

drop policy if exists pcl_read on public.paige_conversation_labels;
create policy pcl_read on public.paige_conversation_labels for select to authenticated
  using (tenant_id = public.current_user_tenant_id());
drop policy if exists pcl_write on public.paige_conversation_labels;
create policy pcl_write on public.paige_conversation_labels for all to authenticated
  using (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']))
  with check (tenant_id = public.current_user_tenant_id() and public.has_any_role(auth.uid(), array['admin','super_admin','coach']));

drop policy if exists pml_read on public.paige_message_labels;
create policy pml_read on public.paige_message_labels for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = paige_message_labels.message_id
      and m.tenant_id = public.current_user_tenant_id()
  ));
drop policy if exists pml_write on public.paige_message_labels;
create policy pml_write on public.paige_message_labels for all to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = paige_message_labels.message_id
      and m.tenant_id = public.current_user_tenant_id()
      and public.has_any_role(auth.uid(), array['admin','super_admin','coach'])
  ));

-- System labels: seeded per tenant on first use (coaching-generic per §2).
-- The triage pass creates these lazily — no platform defaults forced on tenants
-- who haven't received email yet.
create or replace function public.ensure_system_labels(p_tenant uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.paige_conversation_labels (tenant_id, name, slug, color, description, is_system)
  values
    (p_tenant, 'Follow up', 'follow-up', 'var(--gold)', 'Needs a response or action', true),
    (p_tenant, 'Urgent', 'urgent', 'var(--destructive)', 'Time-sensitive, needs attention now', true),
    (p_tenant, 'New lead', 'new-lead', 'var(--ok)', 'Prospect inquiry or buying signal', true),
    (p_tenant, 'At risk', 'at-risk', 'var(--destructive)', 'Client showing disengagement signals', true),
    (p_tenant, 'Question', 'question', 'var(--violet)', 'Client asked a question', true),
    (p_tenant, 'Booking', 'booking', 'var(--ok)', 'Scheduling-related', true),
    (p_tenant, 'Admin', 'admin', 'var(--ink-3)', 'Routine/administrative', true)
  on conflict (tenant_id, slug) do nothing;
$$;

revoke all on function public.ensure_system_labels(uuid) from public, anon, authenticated;
grant execute on function public.ensure_system_labels(uuid) to service_role;

-- The triage queue: unclassified inbound messages (no label applied yet).
-- The cron picks from this view.
create or replace view public.paige_unclassified_inbound as
select m.id, m.tenant_id, m.contact_id, m.subject, m.body_text, m.created_at
from public.messages m
where m.direction = 'inbound'
  and m.status = 'received'
  and not exists (
    select 1 from public.paige_message_labels ml
    where ml.message_id = m.id
  )
order by m.created_at desc;

-- TRUST COMPASS INTEGRATION: the inbox intelligence is an autonomy surface.
-- Register the action kind so the Trust Compass can render its lane and the
-- owner can turn it up or down (auto | confirm | off) from the Compass or chat.
insert into public.paige_action_kinds
  (slug, label, description, default_from_department, default_to_department,
   executor, requires_approval, approval_type, draft_subagent_slug,
   default_autonomy_lane, default_priority)
values
  ('inbox.triage', 'Inbox intelligence',
   'Paige auto-classifies inbound email, applies labels, and files actions. Controllable via Trust Compass.',
   'client_experience', 'owner_ops',
   'record_only', false, 'other', null,
   'auto', 'normal')
on conflict (slug) do nothing;

-- The triage beat: every 5 minutes (same cadence as the action worker,
-- so classification and drafting run in lockstep).
do $$
begin
  if not exists (select 1 from cron.job where command like '%paige-inbox-triage%') then
    perform cron.schedule(
      'paige-inbox-triage',
      '*/5 * * * *',
      $cron$
        select net.http_post(
          url     := 'https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-inbox-triage',
          headers := jsonb_build_object('Content-Type','application/json','x-cron-token', public.cron_token_header()),
          body    := '{}'::jsonb
        );
      $cron$
    );
  end if;
end $$;
