alter table if exists public.paige_pending_approvals
  add column if not exists claimed_at timestamptz;

do $$
declare
  cname text;
begin
  select c.conname into cname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'paige_pending_approvals'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.paige_pending_approvals drop constraint %I', cname);
  end if;
end$$;

alter table public.paige_pending_approvals
  add constraint paige_pending_approvals_status_check
  check (status in (
    'pending', 'approved', 'rejected', 'sent',
    'changes_requested', 'escalated', 'skipped'
  ));

alter table if exists public.paige_approval_comments enable row level security;

drop policy if exists "approval_comments_read_team" on public.paige_approval_comments;
create policy "approval_comments_read_team"
on public.paige_approval_comments
for select
to authenticated
using (
  exists (select 1 from public.paige_pending_approvals a where a.id = approval_id)
);

drop policy if exists "approval_comments_insert_self" on public.paige_approval_comments;
create policy "approval_comments_insert_self"
on public.paige_approval_comments
for insert
to authenticated
with check (author_id = auth.uid());

grant select, insert on public.paige_approval_comments to authenticated;
grant select, insert, update, delete on public.paige_approval_comments to service_role;

create index if not exists idx_paige_pending_approvals_contact_status
  on public.paige_pending_approvals (contact_id, status);
create index if not exists idx_paige_pending_approvals_assigned_status
  on public.paige_pending_approvals (assigned_to_user_id, status);