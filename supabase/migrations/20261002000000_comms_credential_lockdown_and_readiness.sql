-- =============================================================================
-- Solo A2P / communications — credential lockdown + canonical readiness output
--
-- TWO THINGS, one contract:
--
-- 1. CREDENTIAL LOCKDOWN (tenant isolation repair).
--    `tenant_twilio_subaccounts_update` granted UPDATE on the tenant-staff
--    predicate, which includes `coach`, and `grant ... update ... to
--    authenticated` made it reachable over PostgREST. `auth_token_vault_ref`
--    holds the NAME of a Vault secret, and `_shared/twilio.ts resolveTwilioCreds`
--    passes whatever string sits in that column to `read_channel_secret`. A
--    tenant coach could therefore repoint their own row at ANOTHER tenant's
--    Vault ref and cause the service-role resolver to decrypt and authenticate
--    with a different tenant's Twilio API key — a cross-tenant credential use
--    reachable from a browser, invisible in logs because the decrypt succeeds.
--
--    §37 producer inventory before revoking (all eight classes walked):
--      - frontend:        ZERO readers or writers. `grep -rn
--                         "auth_token_vault_ref\|api_key_sid\|twilio_subaccount_sid"
--                         src/` returns no hits.
--      - edge functions:  `provision-tenant-twilio` is the only writer and uses
--                         the SERVICE-ROLE client (index.ts:129,140,240), which
--                         these revokes do not touch. `comms-search-numbers`,
--                         `comms-purchase-number` and `send-message` read via
--                         `resolveTwilioCreds` on a service-role client.
--      - db triggers:     `set_tenant_twilio_subaccount_tenant` is a BEFORE
--                         trigger on this table; unaffected by grants.
--      - RPCs:            `import_tenant_phone_number` only READS this table to
--                         verify a subaccount is in-tenant, and is SECURITY
--                         DEFINER so it bypasses grants entirely.
--      - pg_cron/pg_net:  no job references this table.
--      - GitHub Actions:  none.
--      - external/webhook:no provider posts to this table.
--      - MCP/n8n/scripts: no reference.
--    So no legitimate authenticated caller loses anything.
--
-- 2. CANONICAL READINESS OUTPUT. The answer to "can this tenant text right now,
--    and if not what is missing?" existed in exactly one place — inline inside
--    `send-message`'s SMS adapter — and was therefore unreachable from Settings,
--    Conversations, PAIGE or Systems Check, each of which invented its own
--    weaker answer. This publishes ONE resolver that every surface reads.
--
--    It is deliberately TENANT-SAFE: it returns no Vault ref, no API key SID, no
--    subaccount SID, no webhook name, and no internal diagnostic. A tenant sees
--    what is ready, what is missing, and the next safe step — nothing about the
--    platform's internals.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Credential lockdown
-- -----------------------------------------------------------------------------

-- No direct client access to the credential table at all. Tenant-facing reads go
-- through `tenant_comms_readiness()` below, which returns only safe fields.
revoke all on public.tenant_twilio_subaccounts from authenticated;

drop policy if exists tenant_twilio_subaccounts_select on public.tenant_twilio_subaccounts;
drop policy if exists tenant_twilio_subaccounts_insert on public.tenant_twilio_subaccounts;
drop policy if exists tenant_twilio_subaccounts_update on public.tenant_twilio_subaccounts;

-- Platform operators keep a direct read for the Fleet console. Not super_admin
-- only: `is_platform_operator()` is the delegated-operator helper (§53).
create policy tenant_twilio_subaccounts_operator_select on public.tenant_twilio_subaccounts
  for select to authenticated using (public.is_platform_operator());

-- `tenant_twilio_subaccounts_service_all` is left exactly as it was.

-- Defence in depth: even if a future migration re-grants UPDATE, the credential
-- columns cannot be rewritten by a non-service caller. A grant is never the
-- guard (§59) — the body is.
create or replace function public.guard_twilio_credential_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A service/trusted context has no JWT subject. Provisioning runs there.
  if auth.uid() is null then
    return new;
  end if;
  if new.auth_token_vault_ref  is distinct from old.auth_token_vault_ref
     or new.api_key_sid        is distinct from old.api_key_sid
     or new.twilio_subaccount_sid is distinct from old.twilio_subaccount_sid
     or new.tenant_id          is distinct from old.tenant_id then
    raise exception
      'TWILIO_CREDENTIAL_IMMUTABLE: credential fields are set by provisioning, not by a tenant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_twilio_credential_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_twilio_credential_columns on public.tenant_twilio_subaccounts;
create trigger trg_guard_twilio_credential_columns
  before update on public.tenant_twilio_subaccounts
  for each row execute function public.guard_twilio_credential_columns();

comment on function public.guard_twilio_credential_columns() is
  'Blocks any JWT-bearing caller from rewriting Twilio credential identifiers. Closes the cross-tenant path where a tenant could repoint auth_token_vault_ref at another tenant''s Vault secret and cause the service-role resolver to authenticate with foreign credentials.';

-- -----------------------------------------------------------------------------
-- 2. Canonical readiness output
-- -----------------------------------------------------------------------------
create or replace function public.tenant_comms_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant        uuid;
  v_sub           record;
  v_num           record;
  v_a2p           record;
  v_consent_count int := 0;
  v_suppressed    int := 0;
  v_brand         jsonb;
  v_sms_total     int := 0;
  v_sms_failed    int := 0;
  v_sms_delivered int := 0;
  v_last_inbound  timestamptz;
  v_delivery      text;
  v_blocked       text;
begin
  -- CALLER SCOPE ENFORCED IN-BODY (§59). This is SECURITY DEFINER because it
  -- reads tenant_twilio_subaccounts, which authenticated no longer holds a
  -- grant on. The grant is not the guard.
  if auth.uid() is null then
    raise exception 'COMMS_READINESS_UNAUTHENTICATED' using errcode = '42501';
  end if;
  v_tenant := public.current_user_tenant_id();
  if v_tenant is null then
    raise exception 'COMMS_READINESS_NO_TENANT' using errcode = '42501';
  end if;
  if not (public.is_platform_operator()
          or public.has_any_role(auth.uid(), array['admin','coach'])) then
    raise exception 'COMMS_READINESS_FORBIDDEN' using errcode = '42501';
  end if;

  select tenant_id, status, active into v_sub
    from public.tenant_twilio_subaccounts
   where tenant_id = v_tenant
   limit 1;

  -- The SAME predicate send-message enforces: active, SMS-capable, primary first.
  select phone_number, status, capabilities into v_num
    from public.tenant_phone_numbers
   where tenant_id = v_tenant
     and status = 'active'
     and (capabilities->>'sms' is null or (capabilities->>'sms')::boolean is true)
   order by is_primary desc, purchased_at desc nulls last
   limit 1;

  select status, brand_status, campaign_status, submitted_at into v_a2p
    from public.tenant_a2p_registrations
   where tenant_id = v_tenant
   limit 1;

  select count(*) into v_consent_count
    from public.paige_consent_events
   where tenant_id = v_tenant and channel = 'sms' and action = 'granted';

  select count(*) into v_suppressed
    from public.paige_suppressions
   where tenant_id = v_tenant and channel = 'sms';

  select brand into v_brand from public.tenants where id = v_tenant;

  -- Delivery signal, read from real message rows. This is NOT a claim about
  -- webhook registration — it reports only what the message ledger shows.
  select count(*) filter (where direction = 'outbound'),
         count(*) filter (where direction = 'outbound' and status = 'failed'),
         count(*) filter (where direction = 'outbound' and status = 'delivered'),
         max(sent_at) filter (where direction = 'inbound')
    into v_sms_total, v_sms_failed, v_sms_delivered, v_last_inbound
    from public.messages
   where tenant_id = v_tenant
     and channel_type = 'sms'
     and created_at > now() - interval '30 days';

  v_delivery := case
    when v_sms_total = 0 then 'no_activity'
    when v_sms_failed > 0 and v_sms_delivered = 0 then 'failing'
    when v_sms_failed > 0 then 'mixed'
    else 'delivering'
  end;

  -- The blocking reason, in send-path order, so the surface can name ONE next step.
  v_blocked := case
    when v_sub.tenant_id is null            then 'messaging_account_missing'
    when coalesce(v_sub.active, false) is not true or v_sub.status <> 'active'
                                            then 'messaging_account_inactive'
    when v_num.phone_number is null         then 'no_sms_number'
    when v_a2p.status is null               then 'registration_absent'
    when v_a2p.status <> 'approved'         then 'registration_not_approved'
    when v_consent_count = 0                then 'no_consent_recorded'
    else null
  end;

  return jsonb_build_object(
    'can_send_sms',   v_blocked is null,
    'blocked_reason', v_blocked,
    'subaccount',     case when v_sub.tenant_id is null then 'absent'
                           when coalesce(v_sub.active,false) and v_sub.status = 'active' then 'connected'
                           else 'inactive' end,
    'number',         case when v_num.phone_number is null then 'absent' else 'assigned' end,
    'number_e164',    v_num.phone_number,
    'business',       jsonb_build_object(
                        'has_name',    coalesce(nullif(v_brand->>'business_name',''), nullif(v_brand->>'name','')) is not null,
                        'has_website', nullif(v_brand->>'website','') is not null,
                        'has_phone',   nullif(v_brand->>'business_phone','') is not null),
    'a2p',            case when v_a2p.status is null then 'absent'
                           when v_a2p.status = 'approved' then 'approved'
                           when v_a2p.submitted_at is not null then 'submitted'
                           else 'prepared' end,
    'consent',        jsonb_build_object(
                        'granted_count',    v_consent_count,
                        'suppressed_count', v_suppressed,
                        'state', case when v_consent_count = 0 then 'none_recorded' else 'ready' end),
    'delivery',       jsonb_build_object(
                        'state',           v_delivery,
                        'sent_30d',        v_sms_total,
                        'delivered_30d',   v_sms_delivered,
                        'failed_30d',      v_sms_failed,
                        'last_inbound_at', v_last_inbound),
    'resolved_at',    now()
  );
end;
$$;

revoke all on function public.tenant_comms_readiness() from public, anon;
grant execute on function public.tenant_comms_readiness() to authenticated, service_role;

comment on function public.tenant_comms_readiness() is
  'Canonical, tenant-safe communications readiness for the CALLER''s active tenant. The one answer to "can this tenant text right now, and what is missing?", enforcing the same predicate send-message uses. Returns no credential identifier, no provider SID and no internal diagnostic. Consumed by Settings -> Connections, the Conversations channel disclosure, PAIGE, and (per the Systems Check contract request) comms_configured.';

-- -----------------------------------------------------------------------------
-- 3. Inbound webhook authentication secret
--
-- WHY NOT A TWILIO SIGNATURE. Twilio signs a webhook with the AUTH TOKEN of the
-- account owning the number. This deployment deliberately does not hold one:
-- `_shared/twilio.ts:222-234` documents that auth is scoped API keys
-- (TWILIO_API_KEY_SID + _SECRET) and that the master TWILIO_AUTH_TOKEN is
-- "intentionally absent". Tenant numbers live on SUBACCOUNTS, whose auth tokens
-- are likewise not stored. So there is no key available to validate a signature
-- with — which is precisely why both inbound handlers "verify" by accepting
-- every unsigned request when the token is missing.
--
-- A per-tenant secret in the stamped webhook URL closes that without needing any
-- provider call to mint: we generate it, we store it, we compare it. Signature
-- validation remains the preferred path and is still attempted first whenever a
-- token IS resolvable; this is the fallback that lets the handler FAIL CLOSED
-- instead of accepting anonymous writes to a tenant's consent ledger.
-- -----------------------------------------------------------------------------
alter table public.tenant_twilio_subaccounts
  add column if not exists inbound_webhook_secret text;

comment on column public.tenant_twilio_subaccounts.inbound_webhook_secret is
  'Unguessable per-tenant secret embedded in the stamped inbound/status webhook URL. Lets the handlers authenticate a provider callback in a deployment that holds no Twilio auth token. Service-role only: authenticated has no grant on this table, and guard_twilio_credential_columns blocks JWT-bearing rewrites.';

-- Mint one for every existing subaccount so the value is never null when a
-- number is stamped. gen_random_uuid twice = 288 bits, url-safe.
update public.tenant_twilio_subaccounts
   set inbound_webhook_secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where inbound_webhook_secret is null;

-- The guard must also protect the new column.
create or replace function public.guard_twilio_credential_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.auth_token_vault_ref  is distinct from old.auth_token_vault_ref
     or new.api_key_sid        is distinct from old.api_key_sid
     or new.twilio_subaccount_sid is distinct from old.twilio_subaccount_sid
     or new.inbound_webhook_secret is distinct from old.inbound_webhook_secret
     or new.tenant_id          is distinct from old.tenant_id then
    raise exception
      'TWILIO_CREDENTIAL_IMMUTABLE: credential fields are set by provisioning, not by a tenant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_twilio_credential_columns() from public, anon, authenticated;
