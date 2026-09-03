-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Billing Experience item 5 (owner brief 2026-09-03): the narrow, tenant-safe billing summary
-- Spine can call. Follows the EXACT established PAIGE Spine evidence contract
-- (get_pipeline_spine_evidence(), 20260902004019) — same fixed-field shape, same
-- authenticated/SECURITY DEFINER/tenant-scoped discipline — rather than inventing a second one
-- (§18 one home for "what a Spine evidence row looks like").
--
-- WHY THIS BUILDS ON get_workspace_billing_status(), NEVER A SECOND COMPUTATION OF ITS OWN
-- (§18): every fact this function exposes — access_state, amount due, provider readiness,
-- payment-method connected-ness, seats/contacts/AI usage, primary-selection-needed — is already
-- correctly derived by that function (Slices A-C), including its independence of access_state
-- from provider mapping (R13) and its Owner-only gate (R22). Re-deriving any of it here would be
-- exactly the drift §18 exists to prevent, and a second, subtly different answer to "is this
-- workspace's billing ambiguous" is a defect waiting to happen. This function calls it, reads
-- ONLY the fields Spine is allowed to see, and shapes them into the evidence contract.
--
-- WHAT NEVER LEAVES THIS FUNCTION (brief 2026-09-03, explicit exclusions):
--   raw card/bank info, payment tokens, provider secrets, raw provider ids (no
--   stripe_customer_id / payment_method_id / stripe_account ever selected — and none of those
--   columns even EXIST on get_workspace_billing_status()'s own return shape, so there is nothing
--   to accidentally select), full invoice payloads, private internal cost calculations,
--   cross-workspace information, sales/client-payment data (a completely different rail, §38).
--   Card brand/last4/expiry are ALSO omitted — narrower than what get_workspace_billing_status()
--   itself exposes to the Billing screen — because none of Spine's five listed questions ("what
--   plan," "anything due," "is setup required/connected/unavailable/incomplete," "who is the
--   contact," "what usage," "is action needed") calls for a masked card number. Widen only on a
--   real, named need, not preemptively.
--
-- PRIMARY BILLING CONTACT NAME is disclosed ONLY when the CALLER is the workspace owner
-- (get_workspace_billing_status()'s own can_manage) — Spine never learns who a non-owner caller
-- is talking about, and a non-owner caller sees no evidence at all here (can_view gates the whole
-- row, same as the Billing screen itself, R22).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.get_billing_spine_evidence()
returns table (
  signal_id uuid,
  kind text,
  tenant_id uuid,
  subject_type text,
  subject_ref text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  source_system text,
  source_record_ref text,
  source_actor_type text,
  availability text,
  classification text,
  lifecycle text,
  safe_summary text,
  facts jsonb,
  audience text,
  schema_version integer,
  expires_at timestamptz,
  outcome_ref text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  s record;
  v_primary_name text;
  v_payment_setup_state text;
  v_owner_action_needed boolean;
  v_owner_action_reason text;
  v_summary text;
begin
  if v_uid is null then return; end if;

  select * into s from public.get_workspace_billing_status();
  -- Honest empty result, not a guessed one: no active workspace, wrong scope (sub-account /
  -- agency / enterprise), or the caller may not even VIEW this workspace's billing (R22). Spine
  -- gets nothing to answer with, exactly like the Billing screen itself would show a refusal.
  if s.tenant_id is null or s.scope <> 'top_level' or not coalesce(s.can_view, false) then
    return;
  end if;

  if coalesce(s.can_manage, false) then
    select coalesce(p.full_name, u.email) into v_primary_name
    from public.platform_billing_contacts b
    join public.profiles p on p.user_id = b.user_id
    left join auth.users u on u.id = b.user_id
    where b.tenant_id = s.tenant_id and b.designation = 'primary_contact' and b.revoked_at is null
    order by b.designated_at asc
    limit 1;
  end if;

  v_payment_setup_state := case
    when coalesce(s.payment_method_connected, false) then 'connected'
    when s.provider_state = 'ambiguous' then 'unavailable'
    when coalesce(s.payment_method_required, false) then 'required'
    else 'not_required'
  end;

  v_owner_action_needed := coalesce(s.primary_selection_needed, false)
    or (coalesce(s.payment_method_required, false) and not coalesce(s.payment_method_connected, false));
  v_owner_action_reason := case
    when coalesce(s.primary_selection_needed, false) then
      'This workspace has more than one primary billing contact on record; an owner must choose one.'
    when coalesce(s.payment_method_required, false) and not coalesce(s.payment_method_connected, false) then
      'This workspace''s plan requires a payment method, and none is on file.'
    else null
  end;

  v_summary := case s.access_state
    when 'promotional' then 'Promotional beta access. $0 due today.'
    when 'trial' then 'Beta trial access. $0 due today.'
    when 'paid' then 'Active paid plan.'
    when 'past_due' then 'Most recent payment did not go through.'
    when 'no_plan' then 'No active plan.'
    when 'internal' then 'Internal platform workspace, not a paying or promotional customer.'
    else 'This workspace''s billing state is not currently describable.'
  end;

  return query select
    gen_random_uuid(),
    'billing.status_snapshot'::text,
    s.tenant_id,
    'workspace'::text,
    s.tenant_id::text,
    now(),
    now(),
    'platform_billing'::text,
    ('billing:' || s.tenant_id::text)::text,
    'system'::text,
    'available'::text,
    'operational'::text,
    'observed'::text,
    v_summary,
    jsonb_build_object(
      'plan_slug', s.plan_slug,
      'plan_name', s.plan_name,
      'access_state', s.access_state,
      'billed_by', s.billed_by,
      'amount_due_cents', s.amount_due_cents,
      'payment_setup_state', v_payment_setup_state,
      'primary_billing_contact_name', v_primary_name,
      'seats_used', s.seats_used,
      'seats_included', s.seats_included,
      'contacts_used', s.contacts_used,
      'contacts_included', s.contacts_included,
      'ai_tokens_included', s.ai_tokens_included,
      'ai_credit_token_ratio', s.ai_credit_token_ratio,
      'owner_action_needed', v_owner_action_needed,
      'owner_action_reason', v_owner_action_reason
    ),
    'owner_internal'::text,
    1::integer,
    now() + interval '1 hour',
    ('billing:' || s.tenant_id::text)::text;
end
$$;

revoke all on function public.get_billing_spine_evidence() from public, anon, service_role;
grant execute on function public.get_billing_spine_evidence() to authenticated;

comment on function public.get_billing_spine_evidence() is
  'Billing Experience item 5 (owner brief 2026-09-03): the ONE Spine-safe billing evidence read, '
  'in the SAME fixed-field contract as get_pipeline_spine_evidence() (20260902004019). Built '
  'entirely on get_workspace_billing_status() (§18 -- never a second computation): reads only '
  'plan/promotional status, amount due, payment-setup readiness, primary contact NAME (owner '
  'callers only), measured seats/contacts/AI usage, and whether owner action is needed. Never '
  'exposes a card brand/last4/expiry, a Stripe id, a full invoice, an internal cost estimate, or '
  'another workspace''s data -- none of those fields even exist on the function it reads from. '
  'Owner-only (R22, inherited from get_workspace_billing_status()''s own can_view gate); a '
  'non-owner caller, a sub-account, or an Agency/Enterprise caller gets zero rows, never a guess.';
