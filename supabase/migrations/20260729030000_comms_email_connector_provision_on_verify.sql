-- =============================================================================
-- #141a — Provision the active EMAIL channel_connectors row when a tenant's
--         custom sending domain becomes VERIFIED. The functional wire that makes
--         "connecting email" actually light up the inbox (§36): a verified domain
--         => an active email connector => Conversations flips sendable
--         (canCompose) + handle-inbound-email can resolve the tenant by domain.
-- =============================================================================
-- DOCTRINE HEADER
--  §18 ONE canonical provisioning path. The connector is a STRUCTURAL CONSEQUENCE
--      of a domain reaching status='verified', independent of WHO flipped it — so
--      the invariant is enforced by a DB TRIGGER on public.tenant_email_domains,
--      NOT duplicated inside manage-tenant-domain (which has >1 flip site: the
--      `refresh` verb, the `add` verb when Resend returns 'verified', and the seed
--      INSERT) and NOT a caller-invoked RPC every caller must remember to call.
--      The DB enforces it uniformly for the edge fn, the seed, and any future
--      Paige/SQL path (§10 Paige-governable). No rival send path is introduced:
--      sends still resolve their authoritative from-address via
--      tenant_sender_identity()/resolve_tenant_sender(); this connector's
--      from_address is informational inbox metadata + the inbound routing key.
--  §9  tenant_id is SERVER-DERIVED from NEW.tenant_id of the DOMAIN row (never a
--      request body). The canonical flip path (manage-tenant-domain) runs as
--      SERVICE ROLE, so the existing set_channel_connector_tenant() BEFORE INSERT
--      trigger resolves current_user_tenant_id()=NULL and the explicit domain
--      tenant wins. The ON CONFLICT DO UPDATE additionally carries a
--      `WHERE channel_connectors.tenant_id = NEW.tenant_id` guard so a SECOND
--      tenant verifying the SAME domain string (tenant_email_domains only enforces
--      UNIQUE(tenant_id,domain); uq_channel_connectors_inbound_domain is GLOBAL)
--      can never hijack/re-tenant another tenant's connector row.
--  §13 credentials_vault_ref stays NULL — sends use the shared platform
--      RESEND_API_KEY (an honest null; the secret NAME is not even needed here),
--      so no secret material lands in a row.
--  §37 No schema/column change to channel_connectors or tenant_email_domains and
--      no request/response contract of any existing producer is narrowed. Existing
--      producers (ClientsConversations connector load, handle-inbound-email step
--      3b domain resolver, send-message via _shared/channel-adapters) only GAIN a
--      row they already query for.
--  §32 Provable in ONE BEGIN..ROLLBACK sim: insert tenant_email_domains
--      status='verified' -> assert an active email channel_connectors row with the
--      matching inbound_domain + tenant_id exists; re-run insert-or-update ->
--      still exactly one. The PERSISTED-APPLY proof (prod schema_migrations
--      advanced + trigger object present) is owed via
--      .github/workflows/deploy-migrations.yml on merge to main — do NOT hand-apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The provisioning function — upsert the active email connector for a
--    verified domain. SECURITY DEFINER so it runs regardless of the flip caller's
--    role (mirrors set_message_tenant / tg_comms_file_outbound_draft in C-1).
-- -----------------------------------------------------------------------------
create or replace function public.provision_email_connector_on_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _from_addr text := coalesce(nullif(new.from_email_local, ''), 'no-reply') || '@' || new.domain;
begin
  -- Only act on the TRANSITION into 'verified'. OLD/TG_OP are legal in the function
  -- body (unlike a combined trigger's WHEN clause, which cannot reference OLD). A
  -- verified->verified touch (e.g. a refresh re-writing the same status) is a no-op.
  if tg_op = 'UPDATE' and old.status = 'verified' then
    return new;
  end if;

  -- Idempotent by construction on the EXISTING partial unique index
  -- uq_channel_connectors_inbound_domain (channel_type, inbound_domain)
  -- WHERE inbound_domain IS NOT NULL. Re-verify / refresh-again / webhook retry
  -- never dups; a same-tenant re-verify just reactivates + refreshes identity.
  insert into public.channel_connectors (
    tenant_id, channel_type, provider,
    inbound_domain, inbound_address,
    from_name, from_address, reply_to,
    display_name, status, active,
    credentials_vault_ref, config
  ) values (
    new.tenant_id, 'email', 'resend',
    new.domain, null,
    new.from_name, _from_addr, _from_addr,
    new.from_name, 'active', true,
    null,
    jsonb_build_object('source', 'tenant_email_domain', 'tenant_email_domain_id', new.id)
  )
  on conflict (channel_type, inbound_domain) where inbound_domain is not null
  do update set
    active                = true,
    status                = 'active',
    provider              = 'resend',
    from_name             = excluded.from_name,
    from_address          = excluded.from_address,
    reply_to              = excluded.reply_to,
    display_name          = excluded.display_name,
    config                = excluded.config,
    updated_at            = now()
  -- §9 cross-tenant hijack guard: only ever touch a row the SAME tenant owns.
  -- A second tenant verifying the same domain string is a no-op collision.
  where public.channel_connectors.tenant_id = new.tenant_id;

  return new;
end;
$$;

comment on function public.provision_email_connector_on_verify() is
  '#141a: on a tenant domain reaching status=verified, upsert its active email channel_connectors row (inbound_domain routing + informational sender identity). Idempotent on uq_channel_connectors_inbound_domain; §9 same-tenant guard on the ON CONFLICT.';

-- Candidate-fires whenever a domain row lands/updates with status='verified' (the
-- WHEN clause cannot reference OLD on the INSERT leg of a combined trigger, so the
-- verified->verified no-op guard lives in the function body via TG_OP/OLD above).
drop trigger if exists trg_provision_email_connector on public.tenant_email_domains;
create trigger trg_provision_email_connector
  after insert or update of status on public.tenant_email_domains
  for each row
  when (new.status = 'verified')
  execute function public.provision_email_connector_on_verify();

-- -----------------------------------------------------------------------------
-- 1b. §9 PROVENANCE GATE (BLOCKING — adversarial-verifier finding). tenant_email_domains
--     RLS is FOR ALL for tenant admins with NO column guard on `status`, so before
--     this migration an admin could already forge status='verified' via direct
--     PostgREST — but it was inert. The provisioning trigger above WEAPONIZES it:
--     a forged 'verified' would claim the GLOBAL-unique uq_channel_connectors_inbound_domain
--     slot for an UNPROVEN domain and intercept ANOTHER tenant's inbound mail (§9
--     cross-tenant domain squatting). Gate the transition INTO 'verified' to trusted
--     provenance: only the service-role verification path (manage-tenant-domain, which
--     calls the Resend /domains verify API then writes via its service-role admin
--     client) or a non-JWT context (migrations/seed) may flip a domain to verified.
--     An authenticated end-user (auth.uid() present, not service role) cannot
--     self-promote — the exact attack surface, and no legitimate authenticated path
--     sets 'verified' directly (the UI always routes through manage-tenant-domain).
-- -----------------------------------------------------------------------------
create or replace function public.guard_tenant_email_domain_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified'
     and (tg_op = 'INSERT' or old.status is distinct from 'verified')
     and auth.uid() is not null                          -- a real logged-in end-user; service role & migrations have none
     and coalesce(auth.role(), '') <> 'service_role' then -- canonical platform service-role idiom
    raise exception
      'tenant_email_domains.status can only be set to verified by the domain verification service'
      using errcode = '42501';               -- insufficient_privilege
  end if;
  return new;
end;
$$;

comment on function public.guard_tenant_email_domain_verified() is
  '#141a §9: reject an authenticated non-service caller flipping tenant_email_domains.status to verified — blocks forged-verify domain squatting on the global inbound_domain slot. Only manage-tenant-domain (service role) / migrations may verify.';

drop trigger if exists trg_guard_domain_verified on public.tenant_email_domains;
create trigger trg_guard_domain_verified
  before insert or update of status on public.tenant_email_domains
  for each row
  execute function public.guard_tenant_email_domain_verified();

-- -----------------------------------------------------------------------------
-- 2. Companion — when a verified domain is REMOVED, deactivate its email
--    connector so the inbox never stays "sendable" pointing at a domain the
--    tenant can no longer send from (§31 no dead-end / stale-sendable bug).
--    Deactivate (not delete) to preserve message.connector_id history.
-- -----------------------------------------------------------------------------
create or replace function public.deactivate_email_connector_on_domain_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channel_connectors
     set active = false, status = 'disabled', updated_at = now()
   where channel_type   = 'email'
     and inbound_domain = old.domain
     and tenant_id      = old.tenant_id;
  return old;
end;
$$;

comment on function public.deactivate_email_connector_on_domain_delete() is
  '#141a: on tenant domain removal, deactivate the matching active email connector (same-tenant) so the inbox stops being sendable via a removed domain (§31).';

drop trigger if exists trg_deactivate_email_connector on public.tenant_email_domains;
create trigger trg_deactivate_email_connector
  after delete on public.tenant_email_domains
  for each row
  execute function public.deactivate_email_connector_on_domain_delete();

-- -----------------------------------------------------------------------------
-- 2b. Regression — if a VERIFIED domain later drops back OUT of 'verified' (e.g. a
--     refresh finds DNS removed → status='failed'), deactivate its connector so the
--     inbox stops being "sendable" via a domain that can no longer send (§31/§13 —
--     no stale-sendable bug; a non-blocking verifier finding, folded in here).
-- -----------------------------------------------------------------------------
create or replace function public.deactivate_email_connector_on_domain_unverify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channel_connectors
     set active = false, status = 'disabled', updated_at = now()
   where channel_type   = 'email'
     and inbound_domain = new.domain
     and tenant_id      = new.tenant_id;
  return new;
end;
$$;

comment on function public.deactivate_email_connector_on_domain_unverify() is
  '#141a: on a domain regressing out of status=verified, deactivate its email connector (same-tenant) so the inbox is not sendable via a no-longer-verified domain (§31).';

drop trigger if exists trg_deactivate_email_connector_unverify on public.tenant_email_domains;
create trigger trg_deactivate_email_connector_unverify
  after update of status on public.tenant_email_domains
  for each row
  when (old.status = 'verified' and new.status is distinct from 'verified')
  execute function public.deactivate_email_connector_on_domain_unverify();

-- -----------------------------------------------------------------------------
-- 3. One-time BACKFILL — the trigger only fires on FUTURE writes, so provision
--    every domain ALREADY verified at apply time (the seeded MMA domain + any
--    tenant that verified before this migration). Idempotent via the same
--    ON CONFLICT + §9 same-tenant guard, so re-applying is safe.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select id, tenant_id, domain, from_email_local, from_name
    from public.tenant_email_domains
    where status = 'verified' and tenant_id is not null
  loop
    insert into public.channel_connectors (
      tenant_id, channel_type, provider,
      inbound_domain, inbound_address,
      from_name, from_address, reply_to,
      display_name, status, active,
      credentials_vault_ref, config
    ) values (
      r.tenant_id, 'email', 'resend',
      r.domain, null,
      r.from_name,
      coalesce(nullif(r.from_email_local, ''), 'no-reply') || '@' || r.domain,
      coalesce(nullif(r.from_email_local, ''), 'no-reply') || '@' || r.domain,
      r.from_name, 'active', true,
      null,
      jsonb_build_object('source', 'tenant_email_domain', 'tenant_email_domain_id', r.id)
    )
    on conflict (channel_type, inbound_domain) where inbound_domain is not null
    do update set
      active       = true,
      status       = 'active',
      provider     = 'resend',
      from_name    = excluded.from_name,
      from_address = excluded.from_address,
      reply_to     = excluded.reply_to,
      display_name = excluded.display_name,
      config       = excluded.config,
      updated_at   = now()
    where public.channel_connectors.tenant_id = r.tenant_id;
  end loop;
end $$;
