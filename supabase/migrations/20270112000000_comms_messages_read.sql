-- =============================================================================
-- #1104 — Paige's comms read verb (first Stage 3 capability-mandate slice).
--
-- The owner's finding (2026-09-10): their platform-sent test email IS canonical
-- data (public.messages) but Paige had no registered read verb — she honestly
-- said "I can't see your direct sends." This gives her the inbox ENVELOPE:
-- direction, channel, subject, status, contact, timestamps — bounded, live,
-- caller-scoped. NO body content: the conservative read (redaction by
-- construction); body access is a separately-gated future capability.
--
-- §59 caller-scope-in-body: the caller's tenant is derived from
-- current_user_tenant_id() — a tenant param is never accepted from the wire.
-- Fail-closed: no resolvable tenant → empty set. EXECUTE: authenticated only.
-- =============================================================================

create or replace function public.list_inbox_messages(
  p_limit integer default 20,
  p_direction text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select jsonb_build_object(
             'id', m.id,
             'direction', m.direction,
             'channel', m.channel_type,
             'subject', left(coalesce(m.subject, '(no subject)'), 120),
             'status', m.status,
             'contact_id', m.contact_id,
             'thread_key', m.thread_key,
             'created_at', m.created_at
           ) as t
    from public.messages m
    where m.tenant_id = public.current_user_tenant_id()
      and (p_direction is null or m.direction = p_direction)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) s;
$$;

revoke all on function public.list_inbox_messages(integer, text) from public, anon;
grant execute on function public.list_inbox_messages(integer, text) to authenticated;
