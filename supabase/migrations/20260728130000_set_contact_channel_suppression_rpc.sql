-- =============================================================================
-- set_contact_channel_suppression — the tenant/Paige-callable DND write seam for
-- the Conversations contact rail (Cowork Slice 1B, §43).
--
-- The Conversations rail's per-channel DND toggles (Email / SMS) need to WRITE a
-- paige_suppressions opt-out. Before this migration the ONLY writers were
-- service-role webhooks (handle-inbound-sms STOP, comms-email-unsubscribe) — there
-- was no admin/tenant-facing seam, and the app only READ suppressions. A bare
-- table INSERT/DELETE under RLS would work (§9-safe), but it would skip the paired
-- paige_consent_events audit row that every existing writer emits, leaving the
-- TCPA opt-out/opt-in legal trail incomplete (§13/§17).
--
-- This RPC does the dual-write ATOMICALLY in one call and gives BOTH the UI and
-- Paige one callable seam (§10):
--   suppress=true  → INSERT paige_suppressions (source='admin_ui') + APPEND
--                    paige_consent_events(action='revoked', source='admin_ui')
--   suppress=false → DELETE the suppression                      + APPEND
--                    paige_consent_events(action='granted', source='admin_ui')
-- The consent event is written ONLY when the suppression state actually changed
-- (no audit spam on a redundant toggle).
--
-- tenant_id is NEVER passed by the caller — the BEFORE INSERT trigger
-- set_contact_scoped_tenant() server-derives it from the contact parent (§9,
-- spoof-proof). The guard mirrors assign_contact() (20260711160000): an
-- authenticated caller must be a member of the contact's tenant AND hold
-- admin/super_admin/coach; a service-role caller (Paige headless, auth.uid() null)
-- is trusted and scoped to the contact's own tenant.
--
-- Channels: ONLY 'sms' and 'email' are backed by paige_suppressions (its channel
-- CHECK). 'voice'/'calls' and inbound-block are NOT modeled anywhere yet, so this
-- RPC rejects them rather than pretending — the rail renders those toggles as
-- honestly-disabled "coming soon" (§13), and widening them is tracked follow-up
-- work (a channel-enum ALTER + the matching pre-send/voice gate).
--
-- §37 consumer note: the downstream reader is the pre-send gate
-- (_shared/pre-send-pipeline.ts STEP 2). This RPC keys the suppression by contact_id ONLY —
-- it does NOT write the address_normalized fallback that the contactless webhook writers
-- (handle-inbound-sms STOP, comms-email-unsubscribe) set for sends that carry no contact_id.
-- That is correct for THIS surface: every Conversations send carries the contact_id, so the
-- gate matches by contact + channel and the opt-out is honored immediately, no consumer break.
-- It is intentionally NOT the broader claim that a purely address-matched (contactless) send
-- would be blocked by this row — that path is covered by the webhook writers' address rows.
-- =============================================================================

create or replace function public.set_contact_channel_suppression(
  _contact_id  uuid,
  _channel     text,
  _suppressed  boolean,
  _reason      text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _tenant uuid;
  _ch     text := lower(coalesce(_channel, ''));
  _rsn    text := lower(coalesce(_reason, 'manual'));
  _n      integer := 0;
  _changed boolean := false;
begin
  -- Only the two channels paige_suppressions actually backs (§13 — never a fake write).
  if _ch not in ('sms', 'email') then
    raise exception 'SUPPRESSION_UNSUPPORTED_CHANNEL: % (only sms|email are supported)', _ch
      using errcode = '22023';
  end if;
  -- 'manual' is the correct reason for a tenant-set DND; anything else must be a valid enum value.
  if _rsn not in ('user_stop','complaint','bounce_hard','manual','unsubscribe_link') then
    _rsn := 'manual';
  end if;

  -- Tenant + role guard — mirrors public.assign_contact (20260711160000).
  if _caller is not null then
    _tenant := public.current_user_tenant_id();
    if not (public.is_tenant_member(_tenant)
            and public.has_any_role(_caller, array['admin','super_admin','coach'])) then
      raise exception 'SUPPRESSION_FORBIDDEN: admin or coach required' using errcode = '42501';
    end if;
  else
    -- Service-role (Paige headless): scope to the contact's own tenant.
    select c.tenant_id into _tenant from public.clients c where c.id = _contact_id;
    if _tenant is null then
      raise exception 'SUPPRESSION_NO_TENANT: contact not found' using errcode = '22023';
    end if;
  end if;

  -- The contact must belong to the resolved tenant (§9 — no cross-tenant write).
  if not exists (select 1 from public.clients where id = _contact_id and tenant_id = _tenant) then
    raise exception 'SUPPRESSION_CONTACT_NOT_IN_TENANT' using errcode = '42501';
  end if;

  if _suppressed then
    -- Toggle ON — opt the contact out of this channel. tenant_id is trigger-derived;
    -- ON CONFLICT DO NOTHING makes a repeat toggle a no-op (already opted out = success).
    insert into public.paige_suppressions (contact_id, channel, reason, source)
    values (_contact_id, _ch, _rsn, 'admin_ui')
    on conflict do nothing;
    get diagnostics _n = row_count;
    _changed := (_n > 0);
    if _changed then
      insert into public.paige_consent_events (contact_id, channel, action, source)
      values (_contact_id, _ch, 'revoked', 'admin_ui');
    end if;
  else
    -- Toggle OFF — lift the opt-out. RLS/here both scope to the resolved tenant.
    delete from public.paige_suppressions
      where contact_id = _contact_id and channel = _ch and tenant_id = _tenant;
    get diagnostics _n = row_count;
    _changed := (_n > 0);
    if _changed then
      insert into public.paige_consent_events (contact_id, channel, action, source)
      values (_contact_id, _ch, 'granted', 'admin_ui');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'contact_id', _contact_id,
    'channel', _ch,
    'suppressed', _suppressed,
    'changed', _changed
  );
end $$;

comment on function public.set_contact_channel_suppression(uuid, text, boolean, text) is
  'Conversations rail DND write seam (Slice 1B, §43). Sets/lifts a per-channel (sms|email) paige_suppressions opt-out for a contact AND appends the paired paige_consent_events audit row (revoked on suppress, granted on lift), atomically. tenant_id is server-derived by the set_contact_scoped_tenant trigger (§9). Guard mirrors assign_contact (authenticated admin/super_admin/coach in-tenant, or service-role scoped to the contact tenant). One callable seam for UI + Paige (§10). Rejects unsupported channels (voice/inbound not modeled).';

revoke all on function public.set_contact_channel_suppression(uuid, text, boolean, text) from public;
grant execute on function public.set_contact_channel_suppression(uuid, text, boolean, text) to authenticated, service_role;
