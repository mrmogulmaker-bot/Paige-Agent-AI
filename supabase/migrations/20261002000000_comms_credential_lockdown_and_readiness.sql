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
-- Table privileges are checked BEFORE RLS, so the operator SELECT policy below
-- would never run without this: `revoke all` alone yields "permission denied for
-- table" and the policy is dead. SELECT is granted back and RLS narrows it to
-- platform operators; INSERT and UPDATE stay revoked, which is the actual repair.
grant select on public.tenant_twilio_subaccounts to authenticated;

drop policy if exists tenant_twilio_subaccounts_select on public.tenant_twilio_subaccounts;
drop policy if exists tenant_twilio_subaccounts_insert on public.tenant_twilio_subaccounts;
drop policy if exists tenant_twilio_subaccounts_update on public.tenant_twilio_subaccounts;

-- DELIBERATELY `is_platform_owner()` (super_admin), NOT the delegated
-- `is_platform_operator()`. The dropped policy was super_admin-only, and this
-- table now also holds `inbound_webhook_secret`. Widening the read to
-- platform_admin would hand delegated operators cleartext credential material,
-- which §53 freezes to super_admin and §58 would require calling out as a
-- capability change. Same tier as before, one more column protected.
create policy tenant_twilio_subaccounts_operator_select on public.tenant_twilio_subaccounts
  for select to authenticated using (public.is_platform_owner());

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
  before insert or update on public.tenant_twilio_subaccounts
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
  v_billing       record;
  v_metered_30d   int := 0;
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

  -- Selects the same three credential fields `resolveTwilioCreds` requires. It is
  -- their PRESENCE, not `status`/`active`, that decides whether a send can
  -- authenticate — the creds resolver reads `status` and never uses it. Reporting
  -- "connected" from status alone would let a row with a null api_key_sid render
  -- "Ready to text" while every send returns twilio_subaccount_api_key_missing.
  select tenant_id, status, active,
         (twilio_subaccount_sid is not null
          and auth_token_vault_ref is not null
          and api_key_sid is not null) as creds_complete
    into v_sub
    from public.tenant_twilio_subaccounts
   where tenant_id = v_tenant
   limit 1;

  -- The SAME predicate send-message enforces: active, SMS-capable, primary first.
  select phone_number, status, capabilities into v_num
    from public.tenant_phone_numbers
   where tenant_id = v_tenant
     and status = 'active'
     -- No ::boolean cast: `{"sms":"yes"}` would raise and take the whole read
     -- down. Absent or JSON-null means unspecified, which the send path includes.
     and coalesce(nullif(capabilities->'sms', 'null'::jsonb), 'true'::jsonb) = 'true'::jsonb
   order by is_primary desc, purchased_at desc nulls last
   limit 1;

  select status, brand_status, campaign_status, submitted_at into v_a2p
    from public.tenant_a2p_registrations
   where tenant_id = v_tenant
   limit 1;

  -- How many recipients CURRENTLY consent — the latest event per recipient, which
  -- is what `runPreSend` step 3 evaluates. A raw count of 'granted' rows would
  -- report "ready" for a contact who granted and later texted STOP.
  select count(*) into v_consent_count
    from (
      select distinct on (coalesce(contact_id::text, address_normalized))
             action
        from public.paige_consent_events
       where tenant_id = v_tenant and channel = 'sms'
       order by coalesce(contact_id::text, address_normalized), created_at desc
    ) latest
   where latest.action = 'granted';

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
    -- Sent, but not one delivery receipt has landed. Calling that "delivering"
    -- would be a green health claim built on the ABSENCE of evidence.
    when v_sms_delivered = 0 then 'awaiting_receipts'
    else 'delivering'
  end;

  -- Billing for messaging. Settings -> Connections owns billing setup, so the one
  -- canonical record has to carry it rather than leaving the surface to invent an
  -- answer. Read-only: this REPORTS billing state and never activates, changes or
  -- charges anything.
  --
  -- SCOPED EXPLICITLY to v_tenant. This function is SECURITY DEFINER, so it
  -- bypasses platform_subscriptions' RLS entirely; the `where tenant_id` below IS
  -- the access control, not the policy (§59 — the grant is never the guard).
  --
  -- Returns NO provider identifier. stripe_subscription_id and stripe_customer_id
  -- are deliberately not selected: a Stripe id is a provider payload, and this
  -- record is consumed by surfaces and by PAIGE.
  select ps.status,
         ps.current_period_end,
         coalesce(ps.cancel_at_period_end, false) as cancel_at_period_end,
         pl.name as plan_name
    into v_billing
    from public.platform_subscriptions ps
    left join public.platform_subscription_plans pl on pl.id = ps.plan_id
   where ps.tenant_id = v_tenant
   order by (ps.status = 'active') desc, ps.current_period_end desc nulls last
   limit 1;

  -- Whether messaging usage is actually being RECORDED against that plan. Nothing
  -- has ever written a platform_metered_events row, so for every tenant today this
  -- resolves to not_recording. Reporting "billed" off an active plan alone would
  -- claim metering that demonstrably is not happening (§13).
  select count(*) into v_metered_30d
    from public.platform_metered_events
   where tenant_id = v_tenant
     and created_at > now() - interval '30 days';

  -- The blocking reason, in send-path order, so the surface can name ONE next step.
  --
  -- Billing is deliberately NOT a term here. This resolver's contract is that it
  -- enforces the SAME predicate send-message enforces, and send-message does not
  -- consult billing. Adding it would make can_send_sms disagree with what the send
  -- path actually does — a readiness record that contradicts the runtime is worse
  -- than one that reports less. Billing is reported, never gating.
  v_blocked := case
    when v_sub.tenant_id is null            then 'messaging_account_missing'
    when v_sub.creds_complete is not true    then 'messaging_account_inactive'
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
                           when v_sub.creds_complete is not true then 'inactive'
                           when coalesce(v_sub.active,false) and coalesce(v_sub.status,'') = 'active' then 'connected'
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
                        -- NOT REPORTED, deliberately: nothing writes an inbound
                        -- SMS row to public.messages (handle-inbound-sms inserts
                        -- into paige_conversations), so this column is
                        -- structurally always null. A definite "no replies
                        -- received" from an unwritten column is the same class of
                        -- lie as a fabricated positive.
                        'last_inbound_at', v_last_inbound,
                        'inbound_reporting', 'unavailable'),
    'billing',        jsonb_build_object(
                        'subscription', case
                                          when v_billing.status is null then 'absent'
                                          when v_billing.status = 'active' then 'active'
                                          else 'inactive' end,
                        'plan_name',            v_billing.plan_name,
                        'period_end',           v_billing.current_period_end,
                        'cancel_at_period_end', coalesce(v_billing.cancel_at_period_end, false),
                        -- Honest today: nothing writes platform_metered_events, so
                        -- this is 'not_recording' for every tenant. It is reported
                        -- rather than hidden so the surface can say messaging usage
                        -- is not being metered instead of implying that it is.
                        'usage_metering', case when v_metered_30d > 0
                                               then 'recording' else 'not_recording' end,
                        'metered_events_30d', v_metered_30d),
    'tenant_id',      v_tenant,
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
-- DEFAULT is load-bearing, not cosmetic: `provision-tenant-twilio` does not set
-- this column, so without a default every tenant provisioned after this migration
-- would get NULL and `comms-purchase-number` would refuse their every purchase
-- with no recovery path from any surface.
alter table public.tenant_twilio_subaccounts
  add column if not exists inbound_webhook_secret text
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

comment on column public.tenant_twilio_subaccounts.inbound_webhook_secret is
  'Unguessable per-tenant secret embedded in the stamped inbound/status webhook URL. Lets the handlers authenticate a provider callback in a deployment that holds no Twilio auth token. Service-role only: authenticated has no grant on this table, and guard_twilio_credential_columns blocks JWT-bearing rewrites.';

-- Mint one for every existing subaccount so the value is never null when a
-- number is stamped. gen_random_uuid twice = 288 bits, url-safe.
update public.tenant_twilio_subaccounts
   set inbound_webhook_secret = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where inbound_webhook_secret is null;

-- After the backfill nothing may be null again.
alter table public.tenant_twilio_subaccounts
  alter column inbound_webhook_secret set not null;

-- A secret must identify at most ONE tenant. Without this, two rows sharing a
-- value would make the handler's `maybeSingle()` lookup error into a blanket 401
-- (silent inbound loss), and would make "which tenant does this secret belong to"
-- ambiguous — the exact question the status callback binds its writes to.
create unique index if not exists uq_tenant_twilio_inbound_webhook_secret
  on public.tenant_twilio_subaccounts (inbound_webhook_secret);

-- The guard must also protect the new column.
create or replace function public.guard_twilio_credential_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  -- Trust is decided by the ROLE, not by the absence of a JWT subject.
  -- `auth.uid() is null` is also true for `anon` and for any token minted without
  -- a `sub`, so keying on it would wave through precisely the caller this guard
  -- exists to stop the moment a future migration re-grants the table.
  -- Trust exactly two things, and nothing about the database role.
  --
  --   1. an explicit `service_role` JWT claim — the PostgREST service path;
  --   2. the ABSENCE of any request JWT — which is what a migration or a direct
  --      psql/admin session has.
  --
  -- Two rejected alternatives, both of which were written and then disproved by
  -- a negative control that expected a refusal and got a successful write:
  --   * `current_user in ('postgres',…)` is ALWAYS TRUE inside this function.
  --     It is SECURITY DEFINER, so `current_user` is the function OWNER for every
  --     caller, and the guard would never block anything.
  --   * `session_user in ('postgres',…)` is correct in production but cannot be
  --     exercised from an admin connection, so it ships unproven.
  --   * `auth.uid() is null` is true for `anon` too, and for any token minted
  --     without a `sub` — it would wave through the very caller this exists to stop.
  if v_role = 'service_role' or current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  -- INSERT is covered too. The guard's stated job is surviving a future re-grant,
  -- and the usual re-grant (`grant all on all tables in schema public`) restores
  -- INSERT as well — which would let a tenant holding no row yet create one naming
  -- an arbitrary vault ref.
  if tg_op = 'INSERT' then
    raise exception
      'TWILIO_CREDENTIAL_IMMUTABLE: subaccount rows are created by provisioning, not by a tenant'
      using errcode = '42501';
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
