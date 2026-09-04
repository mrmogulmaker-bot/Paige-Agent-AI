begin;

drop policy if exists "A2P provider events are service only" on public.tenant_a2p_provider_events;
create policy "A2P provider events are service only"
on public.tenant_a2p_provider_events
as restrictive
for all to authenticated
using (false) -- restrictive policy
with check (false); -- restrictive policy

commit;
