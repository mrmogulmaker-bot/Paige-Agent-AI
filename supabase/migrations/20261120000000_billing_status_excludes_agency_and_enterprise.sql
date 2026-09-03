-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Slice C of the Billing Experience rebuild — one correction to get_workspace_billing_status()
-- found while grounding the frontend rebuild against the function's own scope logic.
--
-- get_workspace_billing_status() (Slice A/B) classified every top-level tenant (parent_tenant_id
-- IS NULL) as scope='top_level' and reported plan/usage facts for it. That is correct for a Solo
-- workspace but WRONG for a top-level Agency or Enterprise tenant, which the platform's own
-- established discriminant (account_type NOT IN ('agency','enterprise','sub_account'), used by
-- both platform_billing_account_top_level_guard and platform_billing_contact_guard,
-- 20261045000000) excludes from platform-billing-as-a-Solo-plan entirely. This function was the
-- one place in the Foundation A/B/C billing surface that had not yet applied that same exclusion,
-- found by re-reading the sibling functions before wiring the frontend to this read rather than
-- by a report — no defect has reached an Agency/Enterprise account in production, since Solo
-- Settings is not routed to that tier, but the read itself must be correct on its own terms
-- (§9/§51/§56: a server read must never depend on the caller's route for its own scope truth).
--
-- FIX: read tenants.account_type alongside parent_tenant_id and add a distinct scope='agency' or
-- scope='enterprise' branch (can_view=false, can_manage=false, no plan facts) — the same shape
-- get_workspace_billing_authority() already returns for these account types.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_workspace_billing_status()
RETURNS TABLE(
  tenant_id                uuid,
  workspace_name           text,
  scope                    text,    -- none | sub_account | agency | enterprise | top_level
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
  seats_used                integer,
  contacts_included        integer,
  contacts_used             integer,
  sms_included              integer,
  sms_used                  integer, -- always NULL: no sent-SMS source exists
  ai_tokens_included        bigint,
  ai_credit_token_ratio     integer,
  paid_addons_count         integer,
  primary_contact_count     integer,
  delegate_count            integer,
  primary_selection_needed  boolean,
  notice_delivery_state     text,    -- no_sender | ready
  trial_ends_at              timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t uuid; _parent uuid; _acct text; _owner boolean := false; _name text; _class text;
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
  SELECT t.name, t.parent_tenant_id, t.account_type INTO _name, _parent, _acct
  FROM public.tenants t WHERE t.id = _t;
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
  -- THE FIX: the same top-level-Solo-only discriminant platform_billing_account_top_level_guard
  -- and platform_billing_contact_guard already enforce (20261045000000). An Agency or Enterprise
  -- tenant is top-level by parentage but is never a Solo billing subject.
  IF _acct IN ('agency', 'enterprise') THEN
    RETURN QUERY SELECT _t, _name, _acct::text, false, false,
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
  'The ONE read behind Solo Settings -> Billing (Slice A 20261109040000, provider-mapping table '
  'corrected in Slice B 20261111050000, scope corrected here in Slice C to exclude Agency/'
  'Enterprise top-level tenants -- the same account_type discriminant '
  'platform_billing_account_top_level_guard and platform_billing_contact_guard already enforce, '
  '20261045000000). Owner-only (R22). access_state is never inferred from a missing provider '
  'mapping; provider_state and payment_method_connected are their own readiness facts, reported '
  'separately from access.';
