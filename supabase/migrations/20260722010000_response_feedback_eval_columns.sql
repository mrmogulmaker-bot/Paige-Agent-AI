-- IA slice 1c-vi — wire chat thumbs-up/down into the L2 eval pipe (the "lighter"
-- labeled-case path; the trace-join surgery is a filed fast-follow, §32). Each
-- response_quality_feedback row becomes a self-contained eval case:
--   message_content = output · user_prompt = input · rating = label · correction_note = expected
-- so paige-eval's feedback_selector can consume it TENANT-SCOPED with no trace join.
--
-- §9 is the load-bearing correctness item here: the table had NO tenant column and
-- its INSERT policies gate on role only (admin/coach), so without server-side tenant
-- derivation a coach could tag a row to another tenant. A BEFORE-INSERT trigger
-- derives tenant_id from the JWT (never the client body), plus a RESTRICTIVE policy
-- as belt-and-suspenders. This also closes the standing "no-tenant telemetry" gap.

alter table public.response_quality_feedback
  add column if not exists tenant_id  uuid,
  add column if not exists agent_id   text,
  add column if not exists user_prompt text;

-- Derive tenant server-side. JWT inserts ALWAYS take current_user_tenant_id() — the
-- client-sent value is ignored, so it cannot be spoofed. A service-role caller
-- (Paige's headless agent) may pass the tenant it already resolved; coalesce keeps it.
create or replace function public.set_response_feedback_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    new.tenant_id := coalesce(new.tenant_id, public.current_user_tenant_id());
  else
    new.tenant_id := public.current_user_tenant_id();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_response_feedback_tenant on public.response_quality_feedback;
create trigger trg_response_feedback_tenant
  before insert on public.response_quality_feedback
  for each row execute function public.set_response_feedback_tenant();

-- Defense-in-depth: even if a future policy loosened, a JWT row must carry its own
-- tenant. Evaluated on the post-trigger row, so legitimate inserts pass trivially.
drop policy if exists "Feedback insert must be own tenant" on public.response_quality_feedback;
create policy "Feedback insert must be own tenant"
  on public.response_quality_feedback
  as restrictive for insert
  with check (
    auth.role() = 'service_role'
    or tenant_id = public.current_user_tenant_id()
  );

create index if not exists idx_feedback_tenant on public.response_quality_feedback(tenant_id);

comment on column public.response_quality_feedback.tenant_id is
  'Set server-side by trg_response_feedback_tenant (never the client body). §9 tenant scope for the L2 feedback_selector.';
comment on column public.response_quality_feedback.user_prompt is
  'The paired user turn — the L2 eval-case INPUT (message_content is the output).';
