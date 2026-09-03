-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Slice B of the Billing Experience rebuild (owner brief 2026-09-03, third message + confirmation
-- "let's execute"). Two corrections to Slice A, plus the payment-method connect surface.
--
-- CORRECTION 1 — Slice A's provider_state read the WRONG table. get_workspace_billing_status()
-- read stripe_customer_id off `platform_subscriptions`. Foundation A's real, established mapping
-- of "which Stripe customer belongs to this workspace" is `platform_billing_accounts`, exactly
-- the table get_workspace_billing_authority() reads (20261045000000). Two functions answering
-- "is this workspace mapped" from two different tables is precisely the drift §18 exists to
-- prevent, and it would have made the payment-connect button's own readiness signal wrong the
-- moment it went live. Fixed here to read the SAME table, reusing the SAME ambiguity helper
-- (platform_billing_layer1_customer_ids) the authority function already uses — never reforked.
--
-- CORRECTION 2 — none needed to the one-primary trigger or the un-hitched revoke guard; both are
-- carried forward unchanged from 20261109040000 via CREATE OR REPLACE (idempotent, no-op if
-- already applied by that migration, and load-bearing if this migration is ever the first of the
-- two to land on a fresh environment).
--
-- THE NEW SURFACE — connecting a payment method. Two new pieces:
--   1. platform_billing_accounts gains nullable payment-method columns, written ONLY by
--      stripe-webhook (the established single writer for this table, _shared/platform-billing.ts)
--      — never by the connect edge function, which only ever reads them and triggers the Stripe
--      side effect. A client-echoed card summary is not a source of truth; the webhook is.
--   2. get_workspace_billing_status() gains payment_method_connected / brand / last4 / exp fields,
--      Owner-only like everything else on this read.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.platform_billing_accounts
  ADD COLUMN IF NOT EXISTS payment_method_id             text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_brand           text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_last4           text NULL,
  ADD COLUMN IF NOT EXISTS payment_method_exp_month       integer NULL,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year        integer NULL,
  ADD COLUMN IF NOT EXISTS payment_method_connected_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS payment_method_updated_at      timestamptz NULL;

COMMENT ON COLUMN public.platform_billing_accounts.payment_method_id IS
  'Stripe PaymentMethod id attached as this workspace''s default. NULL until the item 4 connect '
  'flow ships (owner brief 2026-09-03, not yet built as of this migration) — the design is that '
  'it is written ONLY by stripe-webhook, on setup_intent.succeeded / checkout.session.completed '
  '(mode=setup), never by the connect edge function itself, which never receives or echoes '
  'provider payment data. No writer of this column exists yet; independent review, PR #865, '
  'caught this comment overclaiming a present-tense behavior — corrected to state intent.';
COMMENT ON COLUMN public.platform_billing_accounts.payment_method_last4 IS
  'Last 4 digits ONLY. No PAN, no full card number, ever stored here or anywhere on the platform.';

-- ── The one-primary invariant and the un-hitched revoke guard, carried forward from
--    20261109040000 (idempotent CREATE OR REPLACE; a no-op if that migration already applied). ──

CREATE OR REPLACE FUNCTION public.platform_billing_one_primary_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _others int;
BEGIN
  IF NEW.designation <> 'primary_contact' OR NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO _others
  FROM public.platform_billing_contacts r
  WHERE r.tenant_id = NEW.tenant_id
    AND r.designation = 'primary_contact'
    AND r.revoked_at IS NULL
    AND r.id <> NEW.id;
  IF _others > 0 THEN
    RAISE EXCEPTION 'billing_primary_contact_already_designated'
      USING ERRCODE = '23505',
            HINT = 'Revoke the existing primary billing contact before designating another. One workspace has exactly one primary.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_billing_one_primary ON public.platform_billing_contacts;
CREATE TRIGGER trg_platform_billing_one_primary
  BEFORE INSERT OR UPDATE OF designation, revoked_at, tenant_id
  ON public.platform_billing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.platform_billing_one_primary_guard();

CREATE OR REPLACE FUNCTION public.platform_billing_contact_revoke(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t   uuid;
  _des text;
  _uid uuid;
BEGIN
  _t := public.platform_billing_workspace_owner_scope();
  PERFORM pg_advisory_xact_lock(hashtextextended('platform_billing_contacts:' || _t::text, 0));
  SELECT r.designation, r.user_id INTO _des, _uid
  FROM public.platform_billing_contacts r
  WHERE r.id = p_contact_id AND r.tenant_id = _t AND r.revoked_at IS NULL;
  IF _des IS NULL THEN
    RAISE EXCEPTION 'billing_contact_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _des = 'primary_contact'
     AND NOT EXISTS (SELECT 1 FROM public.platform_billing_contacts o
                     WHERE o.tenant_id = _t AND o.designation = 'primary_contact'
                       AND o.revoked_at IS NULL AND o.id <> p_contact_id) THEN
    RAISE EXCEPTION 'billing_primary_contact_required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_billing_contacts
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_contact_id;
  INSERT INTO public.paige_audit_log (actor_user_id, actor_role, action, target_type, target_id, tenant_id, payload)
  VALUES (auth.uid(), 'owner', 'platform_billing_contact_revoked', 'platform_billing_contact', p_contact_id, _t,
          jsonb_build_object('designation', _des, 'recipient_user_id', _uid));
  RETURN jsonb_build_object('id', p_contact_id, 'revoked', true);
END;
$$;

-- ── get_workspace_billing_status(), CORRECTED to read the mapping from the real Foundation A
--    table and carrying the payment-method summary. ──────────────────────────────────────────
-- DROP first: this inserts 5 new payment_method_* columns into the MIDDLE of Slice A's column
-- list (after provider_state). Postgres refuses CREATE OR REPLACE FUNCTION when the RETURNS TABLE
-- row type changes ("cannot change return type of existing function", SQLSTATE 42P13) — caught by
-- database-contract's full sequential migration replay, which applies Slice A first and then hits
-- this REPLACE against the row type Slice A actually installed. A standalone BEGIN..ROLLBACK proof
-- of this file alone never surfaces it, because on an environment where Slice A was never applied
-- first, this CREATE OR REPLACE is really a fresh CREATE with nothing to conflict with.
DROP FUNCTION IF EXISTS public.get_workspace_billing_status();
CREATE OR REPLACE FUNCTION public.get_workspace_billing_status()
RETURNS TABLE(
  tenant_id                uuid,
  workspace_name           text,
  scope                    text,    -- none | sub_account | top_level
  can_view                 boolean, -- R22, Owner-only
  can_manage               boolean,
  access_state             text,    -- promotional | trial | paid | past_due | internal | no_plan | unknown
  revenue_class            text,
  plan_slug                text,
  plan_name                text,
  amount_due_cents         integer,
  payment_method_required  boolean,
  billed_by                text,    -- always 'PAIGE Platform' where a plan exists
  provider_state           text,    -- not_created | mapped | ambiguous
  payment_method_connected boolean,
  payment_method_brand     text,
  payment_method_last4     text,
  payment_method_exp_month integer,
  payment_method_exp_year  integer,
  seats_included           integer,
  seats_used               integer,
  contacts_included        integer,
  contacts_used            integer,
  sms_included             integer,
  sms_used                 integer, -- always NULL: no sent-SMS source exists
  ai_tokens_included       bigint,
  ai_credit_token_ratio    integer,
  paid_addons_count        integer,
  primary_contact_count    integer,
  delegate_count           integer,
  primary_selection_needed boolean,
  notice_delivery_state    text,    -- no_sender | ready
  trial_ends_at            timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t uuid; _parent uuid; _owner boolean := false; _name text; _class text;
  _slug text; _pname text; _price integer; _seats integer; _contacts integer;
  _sms integer; _aitok bigint; _ratio integer;
  _substatus text; _sub text; _periodend timestamptz;
  _state text; _primaries integer; _delegates integer; _paid_addons integer;
  _mapped_cust text; _mapped_pm text; _pm_brand text; _pm_last4 text;
  _pm_exp_m integer; _pm_exp_y integer;
  _layer1_ids text[]; _provider_state text;
BEGIN
  _t := public.billing_active_tenant_id();
  IF _t IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'none'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, false, NULL::text, NULL::text, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  SELECT t.name, t.parent_tenant_id INTO _name, _parent FROM public.tenants t WHERE t.id = _t;
  _owner := public.is_tenant_owner(auth.uid(), _t);
  IF _parent IS NOT NULL THEN
    RETURN QUERY SELECT _t, _name, 'sub_account'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, false, NULL::text, NULL::text, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF NOT _owner THEN
    RETURN QUERY SELECT _t, _name, 'top_level'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, false, NULL::text, NULL::text, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT c.revenue_class INTO _class
  FROM public.tenant_revenue_classification c WHERE c.tenant_id = _t;

  SELECT pl.slug, pl.name, pl.monthly_price_cents, pl.included_seats, pl.included_contacts,
         NULLIF(pl.metered_addons->>'sms_included','')::integer,
         pl.included_ai_tokens_month, pl.ai_credit_token_ratio,
         ps.status, ps.stripe_subscription_id, ps.current_period_end
    INTO _slug, _pname, _price, _seats, _contacts, _sms, _aitok, _ratio,
         _substatus, _sub, _periodend
  FROM public.platform_subscriptions ps
  JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
  WHERE ps.tenant_id = _t
  ORDER BY ps.created_at DESC
  LIMIT 1;

  -- THE FIX: the mapping and its ambiguity are read from the SAME table and the SAME helper
  -- get_workspace_billing_authority() already uses (20261045000000) — never a second source.
  SELECT a.stripe_customer_id, a.payment_method_id, a.payment_method_brand, a.payment_method_last4,
         a.payment_method_exp_month, a.payment_method_exp_year
    INTO _mapped_cust, _mapped_pm, _pm_brand, _pm_last4, _pm_exp_m, _pm_exp_y
  FROM public.platform_billing_accounts a WHERE a.tenant_id = _t;

  _layer1_ids := public.platform_billing_layer1_customer_ids(_t);
  IF _mapped_cust IS NOT NULL THEN
    _provider_state := CASE WHEN EXISTS (SELECT 1 FROM unnest(_layer1_ids) u WHERE u <> _mapped_cust)
                            THEN 'ambiguous' ELSE 'mapped' END;
  ELSIF cardinality(_layer1_ids) > 1 THEN
    _provider_state := 'ambiguous';
  ELSE
    _provider_state := 'not_created';
  END IF;

  IF _slug IS NULL THEN
    _state := CASE WHEN _class = 'internal_test' THEN 'internal' ELSE 'no_plan' END;
  ELSIF _class = 'internal_test' THEN
    _state := 'internal';
  ELSIF _substatus = 'past_due' THEN
    _state := 'past_due';
  ELSIF _class = 'promotional' THEN
    _state := 'promotional';
  ELSIF _substatus = 'trialing' THEN
    _state := 'trial';
  ELSIF _class = 'paid' AND _sub IS NOT NULL AND _substatus = 'active' THEN
    _state := 'paid';
  ELSE
    _state := 'unknown';
  END IF;

  SELECT count(*) FILTER (WHERE b.designation='primary_contact'),
         count(*) FILTER (WHERE b.designation='delegate')
    INTO _primaries, _delegates
  FROM public.platform_billing_contacts b
  WHERE b.tenant_id = _t AND b.revoked_at IS NULL;

  SELECT count(*) INTO _paid_addons
  FROM public.marketplace_installs i
  JOIN public.marketplace_items mi ON mi.id = i.item_id
  WHERE i.tenant_id = _t AND i.status = 'active'
    AND COALESCE(mi.pricing_model,'free') <> 'free'
    AND COALESCE(mi.price_cents,0) > 0;

  RETURN QUERY SELECT
    _t, _name, 'top_level'::text, true, true,
    _state, _class, _slug, _pname,
    CASE WHEN _state IN ('paid','past_due') THEN _price ELSE 0 END,
    (_state IN ('paid','past_due')),
    CASE WHEN _slug IS NULL THEN NULL ELSE 'PAIGE Platform' END,
    _provider_state,
    (_mapped_pm IS NOT NULL),
    _pm_brand, _pm_last4, _pm_exp_m, _pm_exp_y,
    _seats,
    (SELECT count(*)::int FROM public.tenant_members m WHERE m.tenant_id = _t AND m.status = 'active'),
    _contacts,
    (SELECT count(*)::int FROM public.clients k WHERE k.tenant_id = _t),
    _sms, NULL::integer,
    _aitok, _ratio, _paid_addons,
    _primaries, _delegates,
    (_primaries > 1),
    'no_sender'::text,
    CASE WHEN _substatus = 'trialing' THEN _periodend ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_billing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_billing_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_workspace_billing_status() IS
  'The ONE read behind Solo Settings -> Billing (Slice A 20261109040000, corrected here in Slice B '
  'to read the provider mapping from platform_billing_accounts -- the SAME table '
  'get_workspace_billing_authority() reads -- rather than platform_subscriptions.stripe_customer_id, '
  'which was never the Foundation A mapping of record. Owner-only (R22). access_state is never '
  'inferred from a missing provider mapping; provider_state and payment_method_connected are their '
  'own readiness facts, reported separately from access.';
