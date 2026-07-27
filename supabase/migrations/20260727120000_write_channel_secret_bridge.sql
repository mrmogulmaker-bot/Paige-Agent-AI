-- =============================================================================
-- Comms Slice C-2a — the WRITE half of the Vault bridge
-- =============================================================================
-- read_channel_secret(_ref) (migration 20260726210000 §13) is the READ half — the only
-- path a Deno edge function has to vault.decrypted_secrets. This is its WRITE companion:
-- upsert a named secret so the provisioning fn (provision-tenant-twilio) can vault a
-- tenant's Twilio subaccount auth token, and resolveTwilioCreds later reads it back by the
-- SAME name. Upsert-by-name (not insert) so a re-run after a failed insert overwrites
-- rather than duplicating the secret.
--
--  §9  service_role ONLY (never anon/authenticated) — the token must never transit a client
--      role. The CALLER resolves the ref server-authoritatively (the fn derives it from the
--      tenant_id it is provisioning); this function only writes the value under that name.
--  §13 Returns the ref (the name), NEVER the secret value.
--  §18 Mirrors read_channel_secret's name-keyed, SECURITY-DEFINER, service_role-only shape —
--      the one home for the Vault bridge, no second pattern.
-- =============================================================================

create or replace function public.write_channel_secret(
  _ref text,
  _secret text,
  _description text default null
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  _id uuid;
begin
  if _ref is null or length(_ref) = 0 or _secret is null or length(_secret) = 0 then
    raise exception 'write_channel_secret: ref and secret are required' using errcode = 'check_violation';
  end if;
  select id into _id from vault.secrets where name = _ref;
  if _id is null then
    perform vault.create_secret(_secret, _ref, coalesce(_description, ''));
  else
    perform vault.update_secret(_id, _secret, _ref, coalesce(_description, ''));
  end if;
  return _ref;
end;
$$;

revoke all on function public.write_channel_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.write_channel_secret(text, text, text) to service_role;

comment on function public.write_channel_secret(text, text, text) is
  'Comms C-2a Vault bridge (write half): upsert a named Vault secret for an edge fn (service_role only). Caller resolves the ref server-authoritatively (§9). Never granted to anon/authenticated; returns the ref, never the secret.';
