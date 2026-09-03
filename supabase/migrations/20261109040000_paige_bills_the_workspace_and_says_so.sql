-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The Billing Experience, source truth (owner brief 2026-09-03, two messages).
--
-- THE MODEL, stated because the previous surface got it backwards:
--   The PAIGE Platform Operator bills the Solo workspace. The workspace is the SUBSCRIBER.
--   Stripe is an eventual payment processor BEHIND the platform; it is not the identity of the
--   biller, and a Solo owner is never asked to configure one. What a Solo business charges its
--   own clients is a different direction of money entirely and lives in Campaigns → Sales.
--
-- Three defects this migration fixes, all found in PRODUCTION data rather than by reading code:
--
--   1. TWO live primary billing contacts on one workspace. `platform_billing_contact_designate`
--      rejects the same USER twice but never constrained one primary PER WORKSPACE, so two
--      different owners could each be made primary. Mogul Maker Academy has exactly that.
--
--   2. The sole-primary revoke guard is INERT. It only fires when the workspace has a
--      `stripe_customer_id`, and no workspace has one — so the "never lose your last billing
--      contact" rule protected nobody. Hitching it to Stripe was the wrong seam: PAIGE bills the
--      workspace whether or not a processor has been wired yet.
--
--   3. No single read could answer "what is this workspace receiving, what is included, who
--      handles billing, and is anything owed" — so the surface inferred an exception from a
--      missing provider mapping and told the owner billing was unavailable. A missing mapping is
--      an internal readiness condition, not the owner's access state.
--
-- WHY A TRIGGER AND NOT A UNIQUE INDEX for (1). A partial unique index is the obvious tool and is
-- the wrong one here: it cannot be created while a violating pair exists, and the only way to
-- create it would be to pick a winner. The owner ruled the opposite — do not label both primary,
-- and do not choose: render a selection-needed state until a human chooses. So the trigger blocks
-- every NEW second primary while leaving the existing pair intact and visible. When the owner has
-- resolved it, the index becomes addable; that is a later, separate change and NOT this one's to
-- sneak in.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- ── 1. One live primary billing contact per workspace, going forward ────────────────────────
CREATE OR REPLACE FUNCTION public.platform_billing_one_primary_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _others int;
BEGIN
  -- Only a row that IS (or becomes) a live primary can violate the rule.
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

COMMENT ON FUNCTION public.platform_billing_one_primary_guard() IS
  'One live primary billing contact per workspace (owner brief 2026-09-03). Blocks a NEW second '
  'primary on every write path, not just the designate RPC. Deliberately tolerant of a pre-existing '
  'violating pair: the owner resolves those by choosing, and this migration does not choose for them.';

-- ── 2. The sole-primary rule stops depending on Stripe ─────────────────────────────────────
-- Unchanged: revoking one of SEVERAL primaries is still allowed — that is exactly how the owner
-- resolves the duplicate pair. What changes is the sole-primary case, which is now protected for
-- any real top-level workspace instead of only a Stripe-mapped one.
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
  -- A workspace never loses its LAST primary billing recipient without another being chosen first.
  -- The previous version also required `stripe_customer_id IS NOT NULL`, which made it unreachable
  -- for every workspace that exists: the platform bills the workspace, and whether a processor has
  -- been wired is the platform's readiness, not the owner's obligation.
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

-- ── 3. The ONE read the Billing page needs ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_billing_status()
RETURNS TABLE(
  tenant_id             uuid,
  workspace_name        text,
  scope                 text,    -- none | sub_account | top_level
  can_view              boolean, -- R22, Owner-only
  can_manage            boolean,
  -- What the owner is actually receiving. NOT derived from a provider mapping.
  access_state          text,    -- promotional | trial | paid | past_due | internal | no_plan | unknown
  revenue_class         text,
  plan_slug             text,
  plan_name             text,
  -- Only a charge that is REAL. A catalogue price is a list price, never a statement of what is owed.
  amount_due_cents      integer,
  payment_method_required boolean,
  billed_by             text,    -- always 'PAIGE Platform' where a plan exists
  provider_state        text,    -- not_created | mapped | unavailable
  -- Included resources, with what is actually used where a source exists.
  seats_included        integer,
  seats_used            integer,
  contacts_included     integer,
  contacts_used         integer,
  sms_included          integer,
  sms_used              integer, -- always NULL: no SMS usage source exists (see comment)
  ai_tokens_included    bigint,
  ai_credit_token_ratio integer,
  paid_addons_count     integer,
  -- Billing recipients and whether notices can actually reach anyone.
  primary_contact_count integer,
  delegate_count        integer,
  primary_selection_needed boolean,
  notice_delivery_state text,    -- no_sender | ready
  -- Set ONLY when the subscription status is 'trialing'. There is no trial_end column on
  -- platform_subscriptions (verified on prod), so a trial's end is that subscription's current
  -- period end — and deriving "trial" from a period end alone would mislabel every promotional
  -- workspace, all of which carry a seeded one.
  trial_ends_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t uuid; _parent uuid; _owner boolean := false; _name text; _class text;
  _slug text; _pname text; _price integer; _seats integer; _contacts integer;
  _sms integer; _aitok bigint; _ratio integer;
  _substatus text; _cust text; _sub text; _trialend timestamptz; _periodend timestamptz;
  _state text; _primaries integer; _delegates integer; _paid_addons integer;
BEGIN
  _t := public.billing_active_tenant_id();
  IF _t IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'none'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT t.name, t.parent_tenant_id INTO _name, _parent FROM public.tenants t WHERE t.id = _t;
  _owner := public.is_tenant_owner(auth.uid(), _t);

  IF _parent IS NOT NULL THEN
    -- A sub-account is billed through its parent agency. Saying anything about a plan or a charge
    -- here would be a claim about an arrangement this workspace is not party to.
    RETURN QUERY SELECT _t, _name, 'sub_account'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT _owner THEN
    RETURN QUERY SELECT _t, _name, 'top_level'::text, false, false,
      'unknown'::text, NULL::text, NULL::text, NULL::text, NULL::integer, false,
      NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::bigint, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT c.revenue_class INTO _class
  FROM public.tenant_revenue_classification c WHERE c.tenant_id = _t;

  SELECT pl.slug, pl.name, pl.monthly_price_cents, pl.included_seats, pl.included_contacts,
         NULLIF(pl.metered_addons->>'sms_included','')::integer,
         pl.included_ai_tokens_month, pl.ai_credit_token_ratio,
         ps.status, ps.stripe_customer_id, ps.stripe_subscription_id, ps.current_period_end
    INTO _slug, _pname, _price, _seats, _contacts, _sms, _aitok, _ratio,
         _substatus, _cust, _sub, _periodend
  FROM public.platform_subscriptions ps
  JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id
  WHERE ps.tenant_id = _t
  ORDER BY ps.created_at DESC
  LIMIT 1;

  -- ACCESS STATE. Read from records that prove it, in a fixed precedence, and never inferred from
  -- the absence of a provider mapping (which is the bug this whole slice exists to correct).
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

  -- ALIASED, and it matters: this function's RETURNS TABLE declares an OUT parameter `tenant_id`,
  -- which shadows the column of the same name and makes a bare `tenant_id` ambiguous at RUNTIME.
  -- The function still CREATEs cleanly with the bare reference — plpgsql resolves identifiers when
  -- the statement first executes, not when it is defined — so this is invisible to a build and to
  -- any check that only asserts the function exists. Every table reference in this function is
  -- qualified for that reason, not for tidiness.
  SELECT count(*) FILTER (WHERE b.designation='primary_contact'),
         count(*) FILTER (WHERE b.designation='delegate')
    INTO _primaries, _delegates
  FROM public.platform_billing_contacts b
  WHERE b.tenant_id = _t AND b.revoked_at IS NULL;

  -- Only an add-on someone is actually charged for. Every current install is pricing_model='free',
  -- so this is 0 everywhere today — which is the honest answer, not a reason to omit the field.
  SELECT count(*) INTO _paid_addons
  FROM public.marketplace_installs i
  JOIN public.marketplace_items mi ON mi.id = i.item_id
  WHERE i.tenant_id = _t AND i.status = 'active'
    AND COALESCE(mi.pricing_model,'free') <> 'free'
    AND COALESCE(mi.price_cents,0) > 0;

  RETURN QUERY SELECT
    _t, _name, 'top_level'::text, true, true,
    _state, _class, _slug, _pname,
    -- Nothing is due unless a real paid subscription says so. A promotional workspace owes $0, and
    -- the plan's list price is NOT presented as a charge.
    CASE WHEN _state IN ('paid','past_due') THEN _price ELSE 0 END,
    (_state IN ('paid','past_due')),
    CASE WHEN _slug IS NULL THEN NULL ELSE 'PAIGE Platform' END,
    CASE WHEN _cust IS NOT NULL THEN 'mapped' ELSE 'not_created' END,
    _seats,
    (SELECT count(*)::int FROM public.tenant_members m WHERE m.tenant_id = _t AND m.status = 'active'),
    _contacts,
    (SELECT count(*)::int FROM public.clients k WHERE k.tenant_id = _t),
    _sms,
    -- NULL, and it must stay NULL until a source exists. platform_usage_events carries only
    -- llm_tokens, tts_char and tenant_provisioned — there is no sent-SMS event to count, and
    -- sms_verifications is one-time-password traffic, not billable messaging.
    NULL::integer,
    _aitok, _ratio, _paid_addons,
    _primaries, _delegates,
    (_primaries > 1),
    -- Delivery is NOT live. No sender exists for billing notices anywhere on the platform, and
    -- platform_billing_notification_log has never held a row. A designation records who notices
    -- will reach; it does not put anything in an inbox.
    'no_sender'::text,
    CASE WHEN _substatus = 'trialing' THEN _periodend ELSE NULL END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_billing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_billing_status() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_workspace_billing_status() IS
  'The ONE read behind Solo Settings → Billing: what this workspace receives from the PAIGE '
  'Platform, what is included, who handles billing, and what is owed. auth.uid()-keyed, workspace '
  'resolved server-side by billing_active_tenant_id(), Owner-only (R22). access_state comes from '
  'records that prove it and is NEVER inferred from a missing provider mapping — a mapping is '
  'platform readiness, not the owner''s access. amount_due_cents is 0 unless a real paid '
  'subscription says otherwise; a catalogue price is a list price. sms_used is NULL because no '
  'sent-SMS source exists. primary_selection_needed is true when historical data left more than one '
  'live primary: the owner chooses, the platform does not choose for them.';
