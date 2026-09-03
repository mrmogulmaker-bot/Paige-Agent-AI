-- Slice 2B follow-up — six findings from an independent review that ran AFTER the merge.
--
-- WHY THIS IS A SEPARATE MIGRATION. 20261110000000 is applied on production, so it is not editable.
-- These are corrections to functions it created, re-declared here in full.
--
-- WHY THE FINDINGS LANDED LATE, recorded because the sequencing is the actual lesson. #800 was
-- marked ready at 14:09:21, the review began on that head at 14:09:25, and it merged at 14:09:45.
-- Twenty seconds. The review had no window. Four of the six are P1 and two are money-correctness,
-- so this is not a hypothetical cost of merging in the same beat as marking ready.
--
-- THE SIX, each verified against the code before being accepted:
--
-- 1. (frontend) A draft opened in workspace A and saved after switching to B was CREATED IN B.
--    `_expected_tenant_id` is refusal-only and correct, but the client was sending the CURRENT
--    tenant rather than the one the form was opened against, so the guard could never fire. Fixed
--    in `catalog-offers.tsx` by capturing the workspace on open and sending that; the draft is also
--    discarded when the workspace changes. The guard below is unchanged — it was never the defect.
--
-- 2. OVERWRITING A STRIPE-BACKED PRICE. `tenant-product-upsert` writes its first price with
--    `sort_order: 0` AND a `stripe_price_id`. The previous version targeted `sort_order = 0`, so it
--    would rewrite that row's amount, currency and interval while Stripe kept the old Price. The
--    storefront would then display the new figure and `tenant-checkout-session` would charge the
--    unchanged Stripe id — a customer charged something other than what they were shown. This is
--    the exact §38 divergence the slice claimed to avoid by never touching Stripe; not touching
--    Stripe is not sufficient if you rewrite the row Stripe is mirroring.
--    Now: a row carrying `stripe_price_id` is REFUSED, in words, and the definition still saves.
--
-- 3. EDITING A DIFFERENT PLAN THAN THE FORM SHOWED. `leadPrice` picks the CHEAPEST active plan;
--    the previous version always wrote `sort_order = 0`. On a multi-plan offer, a name-only edit
--    copied the displayed plan's figures over a different plan. Now the caller passes the exact
--    `_price_id` the form was populated from, and the update is by id, scoped to tenant + product.
--
-- 4. DEPOSIT AND INSTALMENT KINDS CLOBBERED. `kind` was derived from the interval on every save, so
--    a name-only edit turned a deposit into `one_time` and an instalment into `recurring` — the
--    latter leaving `installments_total` populated on a row no longer classified as one. The editor
--    does not author those shapes, so it now REFUSES to touch them rather than flattening them.
--
-- 5. PUBLISHING AN OFFER THAT CANNOT BE CHARGED. A price written here has no `stripe_price_id`.
--    On a storefront-enabled tenant, publishing exposed the offer and its Buy button through the
--    anon reads while `tenant-checkout-session` refused with `price_not_synced_to_stripe`. Now
--    publication on a storefront-enabled tenant requires a checkout-ready price or an explicit
--    "price on application". Unreachable today (0 tenants have a storefront) and fixed anyway.
--
-- 6. CLEARING THE PRICE DID NOT CLEAR IT. A null amount skipped all price work, so the old active
--    price reappeared after a refresh — while the editor's own footer promises blanks stay unstated.
--    Now a null amount DEACTIVATES the managed row, which is what the surface already claims.

CREATE OR REPLACE FUNCTION public.save_solo_offer(
  _expected_tenant_id  uuid,
  _offer_id            uuid,
  _name                text,
  _summary             text   DEFAULT NULL,
  _description         text   DEFAULT NULL,
  _offer_kind          text   DEFAULT NULL,
  _delivery_shape      text   DEFAULT NULL,
  _price_presentation  text   DEFAULT NULL,
  _customer_action     text   DEFAULT NULL,
  _category            text   DEFAULT NULL,
  _price_amount        integer DEFAULT NULL,
  _price_currency      text   DEFAULT NULL,
  _price_interval      text   DEFAULT NULL,
  _expected_updated_at timestamptz DEFAULT NULL,
  -- NEW: the exact price row the form was populated from. Null means "no plan was shown", so a
  -- supplied amount inserts a new one. This is finding 3's fix: the row edited is the row seen.
  _price_id            uuid   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor    uuid := auth.uid();
  _tenant   uuid := public.current_user_tenant_id();
  _row      public.tenant_products;
  _price    public.tenant_prices;
  _clean    text;
  _currency text;
  _interval text;
  _kind     text;
  _price_note text := NULL;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may change what this business sells'
      USING ERRCODE = '42501';
  END IF;

  _clean := nullif(btrim(coalesce(_name, '')), '');
  IF _clean IS NULL THEN
    RAISE EXCEPTION 'an offer needs a name';
  END IF;

  _offer_kind         := nullif(btrim(coalesce(_offer_kind, '')), '');
  _delivery_shape     := nullif(btrim(coalesce(_delivery_shape, '')), '');
  _price_presentation := nullif(btrim(coalesce(_price_presentation, '')), '');
  _customer_action    := nullif(btrim(coalesce(_customer_action, '')), '');
  _category           := nullif(btrim(coalesce(_category, '')), '');
  _summary            := nullif(btrim(coalesce(_summary, '')), '');
  _description        := nullif(btrim(coalesce(_description, '')), '');

  IF _offer_kind IS NOT NULL AND _offer_kind NOT IN ('product', 'service') THEN
    RAISE EXCEPTION 'an offer is a product or a service, not %', _offer_kind;
  END IF;
  IF _delivery_shape IS NOT NULL AND _delivery_shape NOT IN
     ('digital', 'physical', 'appointment', 'program', 'membership', 'hybrid') THEN
    RAISE EXCEPTION 'that is not a delivery shape this catalog records: %', _delivery_shape;
  END IF;
  IF _price_presentation IS NOT NULL AND _price_presentation NOT IN ('fixed', 'from', 'contact', 'none') THEN
    RAISE EXCEPTION 'that is not a way this catalog shows a price: %', _price_presentation;
  END IF;
  IF _customer_action IS NOT NULL AND _customer_action NOT IN ('buy', 'book', 'apply', 'enquire', 'learn') THEN
    RAISE EXCEPTION 'that is not a customer action this catalog records: %', _customer_action;
  END IF;

  IF _offer_id IS NULL THEN
    INSERT INTO public.tenant_products
      (tenant_id, name, summary, description, offer_kind, delivery_shape,
       price_presentation, customer_action, category, status, product_type, created_by)
    VALUES
      (_tenant, _clean, _summary, _description, _offer_kind, _delivery_shape,
       _price_presentation, _customer_action, _category, 'draft', 'one_time', _actor)
    RETURNING * INTO _row;
  ELSE
    SELECT * INTO _row
    FROM public.tenant_products p
    WHERE p.id = _offer_id AND p.tenant_id = _tenant
    FOR UPDATE;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'that offer is not in this catalog';
    END IF;

    IF _expected_updated_at IS NOT NULL
       AND _row.updated_at IS DISTINCT FROM _expected_updated_at THEN
      RAISE EXCEPTION 'someone else changed this offer while you were editing it; nothing was saved'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.tenant_products
       SET name               = _clean,
           summary            = _summary,
           description        = _description,
           offer_kind         = _offer_kind,
           delivery_shape     = _delivery_shape,
           price_presentation = _price_presentation,
           customer_action    = _customer_action,
           category           = _category,
           updated_at         = now()
     WHERE id = _row.id
     RETURNING * INTO _row;
  END IF;

  -- ── PRICE ────────────────────────────────────────────────────────────────────────────────────
  -- The definition above is saved either way. A price this editor may not touch is reported as a
  -- NOTE rather than an exception, because failing the whole save would make a renamed offer
  -- impossible for anybody whose price came from the storefront panel.
  IF _price_id IS NOT NULL THEN
    SELECT * INTO _price
    FROM public.tenant_prices tp
    WHERE tp.id = _price_id AND tp.tenant_id = _tenant AND tp.product_id = _row.id
    FOR UPDATE;

    IF _price.id IS NULL THEN
      _price_note := 'That plan is no longer on this offer, so its price was left alone.';
    ELSIF _price.stripe_price_id IS NOT NULL THEN
      -- Finding 2. Rewriting this row desynchronises the displayed price from the charged one.
      _price_note := 'This offer''s price is connected to checkout, so it was not changed here.';
    ELSIF _price.kind IN ('deposit', 'installment') THEN
      -- Finding 4. This editor authors a single flat or recurring price and must not flatten a
      -- deposit or an instalment plan into one.
      _price_note := 'A deposit or instalment plan is not editable here, so it was left as it is.';
    ELSIF _price_amount IS NULL THEN
      -- Finding 6. "Blank stays unstated" has to be true of the record, not only of the form.
      UPDATE public.tenant_prices SET active = false WHERE id = _price.id;
    ELSE
      IF _price_amount < 0 THEN
        RAISE EXCEPTION 'a price cannot be negative';
      END IF;
      _currency := coalesce(lower(nullif(btrim(coalesce(_price_currency, '')), '')), 'usd');
      IF _currency !~ '^[a-z]{3}$' THEN
        RAISE EXCEPTION 'a currency is a three-letter code, not %', _currency;
      END IF;
      _interval := coalesce(nullif(btrim(coalesce(_price_interval, '')), ''), 'one_time');
      IF _interval NOT IN ('one_time', 'day', 'week', 'month', 'year') THEN
        RAISE EXCEPTION 'that is not a billing period this catalog records: %', _interval;
      END IF;
      _kind := CASE WHEN _interval = 'one_time' THEN 'one_time' ELSE 'recurring' END;

      -- Finding 3. By ID, so the row edited is the row the form displayed.
      UPDATE public.tenant_prices
         SET unit_amount = _price_amount, currency = _currency,
             billing_interval = _interval, kind = _kind, active = true
       WHERE id = _price.id;
    END IF;

  ELSIF _price_amount IS NOT NULL THEN
    IF _price_amount < 0 THEN
      RAISE EXCEPTION 'a price cannot be negative';
    END IF;
    _currency := coalesce(lower(nullif(btrim(coalesce(_price_currency, '')), '')), 'usd');
    IF _currency !~ '^[a-z]{3}$' THEN
      RAISE EXCEPTION 'a currency is a three-letter code, not %', _currency;
    END IF;
    _interval := coalesce(nullif(btrim(coalesce(_price_interval, '')), ''), 'one_time');
    IF _interval NOT IN ('one_time', 'day', 'week', 'month', 'year') THEN
      RAISE EXCEPTION 'that is not a billing period this catalog records: %', _interval;
    END IF;
    _kind := CASE WHEN _interval = 'one_time' THEN 'one_time' ELSE 'recurring' END;

    -- No plan was shown, so a new definition-only row is added AFTER any existing plans rather
    -- than at sort_order 0, which is where the storefront panel's Stripe-backed row lives.
    INSERT INTO public.tenant_prices
      (tenant_id, product_id, unit_amount, currency, billing_interval, kind, sort_order, active)
    VALUES
      (_tenant, _row.id, _price_amount, _currency, _interval, _kind,
       coalesce((SELECT max(sort_order) + 1 FROM public.tenant_prices
                  WHERE product_id = _row.id AND tenant_id = _tenant), 0),
       true);
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'updated_at', _row.updated_at,
                            'status', _row.status, 'price_note', _price_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz,uuid) TO authenticated;

-- The 14-argument signature from 20261110000000 is dropped: leaving it callable would leave the
-- sort_order = 0 overwrite reachable, which is finding 2 still live behind an older overload.
DROP FUNCTION IF EXISTS public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz);

-- ── FINDING 5: publication must not expose an offer checkout will refuse ─────────────────────────
-- `status = 'active'` is what makes a row readable by `anon` via `tp_public_active_read`, and on a
-- storefront-enabled tenant that means a Buy button. A price written by the Catalog editor has no
-- `stripe_price_id`, and `tenant-checkout-session` refuses it with `price_not_synced_to_stripe` —
-- so publishing produced a live listing whose only outcome was a failed checkout.
--
-- The condition therefore depends on whether the offer is actually about to face a customer:
--   storefront ENABLED  → a checkout-ready price, or an explicit "price on application"
--   storefront DISABLED → any recorded price is fine; nothing public is being promised
-- Which is unreachable today — 0 tenants have `storefront_enabled` — and correct before it is not.
CREATE OR REPLACE FUNCTION public.set_solo_offer_status(
  _expected_tenant_id  uuid,
  _offer_id            uuid,
  _next_status         text,
  _expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _actor      uuid := auth.uid();
  _tenant     uuid := public.current_user_tenant_id();
  _row        public.tenant_products;
  _next       text := nullif(btrim(coalesce(_next_status, '')), '');
  _storefront boolean;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could run; nothing was changed'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may change what this business sells'
      USING ERRCODE = '42501';
  END IF;

  IF _next IS NULL OR _next NOT IN ('draft', 'active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'that is not a state an offer can be in: %', coalesce(_next, 'nothing');
  END IF;

  SELECT * INTO _row
  FROM public.tenant_products p
  WHERE p.id = _offer_id AND p.tenant_id = _tenant
  FOR UPDATE;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'that offer is not in this catalog';
  END IF;

  IF _expected_updated_at IS NOT NULL
     AND _row.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'someone else changed this offer while you were editing it; nothing was changed'
      USING ERRCODE = '40001';
  END IF;

  IF _row.status = _next THEN
    RETURN jsonb_build_object('id', _row.id, 'status', _row.status,
                              'updated_at', _row.updated_at, 'changed', false);
  END IF;

  IF _next = 'active' AND _row.price_presentation IS DISTINCT FROM 'contact' THEN
    SELECT t.storefront_enabled INTO _storefront FROM public.tenants t WHERE t.id = _tenant;

    IF coalesce(_storefront, false) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.tenant_prices tp
        WHERE tp.product_id = _row.id AND tp.tenant_id = _tenant
          AND tp.active AND tp.stripe_price_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'this offer has no price that checkout can take yet. Set it up for selling, or say the price is on application, before it goes live on your storefront';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.tenant_prices tp
      WHERE tp.product_id = _row.id AND tp.tenant_id = _tenant AND tp.active
    ) THEN
      RAISE EXCEPTION 'give this offer a price, or say the price is on application, before it goes live';
    END IF;
  END IF;

  UPDATE public.tenant_products
     SET status = _next, updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status,
                            'updated_at', _row.updated_at, 'changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_solo_offer_status(uuid,uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_solo_offer_status(uuid,uuid,text,timestamptz) TO authenticated;
