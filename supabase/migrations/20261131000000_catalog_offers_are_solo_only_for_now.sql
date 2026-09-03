-- The Catalog interface (`/solo/{account}/growth/catalog`) is Solo-only today — Agency, sub-account,
-- Enterprise, Operator and legacy Admin have no Catalog UI at all (confirmed by tracing
-- `workspaceEntry.ts`: sub_account routes to `/business/*`, Agency/Enterprise to `/agency/*`, both
-- mount `AgencyApp` with its own `growth.tsx`, neither imports `CatalogOffers`). But the RPCs behind
-- that UI enforce only membership (`is_tenant_admin`), never account type, so an owner/admin of ANY
-- tenant — including a platform operator who also holds a real membership row somewhere — could call
-- them directly and write to a catalog no approved surface exists to show them. Recorded first as a
-- documentation gap (PR #860, rounds 3-5), closed here as a server-side hotfix.
--
-- THE RULING (owner brief, 2026-09-03): Solo is the only account type allowed to create or mutate
-- Catalog offers through these seams, right now. This is not a judgment that other tiers can never
-- have Catalog capability — it is a refusal to grant it BY ACCIDENT while no approved product surface
-- exists for them. A future Agency/Enterprise/sub-account Catalog experience needs its own explicit
-- product decision and cross-tier contract; this migration does not anticipate one.
--
-- THE CHECK mirrors the existing STRICT client-side gate, `isSoloStandalone()`
-- (`src/lib/tier/tierFeatures.ts`): `!parent_tenant_id && account_type === 'standalone'`. That
-- function exists specifically because the fail-safe tier resolver (`resolveTierKey`, which defaults
-- an unknown/null account_type to "solo") is the wrong posture for an authorization decision — a
-- freshly-provisioned or mistyped row must never pass as Solo. The server-side check below is the
-- same literal comparison, not the fail-safe one, for the same reason: this is authorization, and it
-- resolves from the authenticated tenant row (`current_user_tenant_id()`), never a client-supplied
-- account type or tenant claim.
--
-- SCOPE. Only the two RPCs that back the Catalog interface's write path
-- (`useCatalogOffers.ts`'s `runWrite` accepts exactly `"save_solo_offer" | "set_solo_offer_status"`,
-- confirmed by reading its type signature — no other write path exists for this screen). A separate,
-- older seam — `tenant-product-upsert` (used by the legacy `/admin/setup` Storefront panel, and
-- carrying its own pre-existing §38 concern: it mirrors to Stripe on the PLATFORM account via
-- destination charges) — has the same missing account_type check but is NOT part of the Catalog
-- interface this ruling covers, and is out of scope for this narrow hotfix; flagged separately.
--
-- PRODUCER INVENTORY (§37), both RPCs: `useCatalogOffers.ts` (the Catalog editor) and `sales-ops.tsx`
-- (Sales' "quick create offer" flow, PR #866) are the only two callers, both inside `src/solo/`,
-- both reachable only by a `solo`-tier session. Neither is broken by this guard — both only ever
-- operate against the caller's own resolved Solo tenant. No sibling edge function, pg_cron/pg_net
-- job, GitHub Action, external webhook, or n8n/MCP caller references either RPC name.
--
-- Both functions are re-declared with IDENTICAL signatures to 20261111000000 — no new argument, no
-- DROP FUNCTION needed, existing REVOKE/GRANT stay correct as-is.

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
  -- Solo-only gate (this migration).
  _account_type   text;
  _parent_tenant  uuid;
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

  -- Solo-only: literal comparison against the authenticated tenant row, mirroring
  -- isSoloStandalone() — never the fail-safe resolver, and never a client-supplied claim.
  SELECT t.account_type, t.parent_tenant_id INTO _account_type, _parent_tenant
  FROM public.tenants t WHERE t.id = _tenant;

  IF _parent_tenant IS NOT NULL OR _account_type IS DISTINCT FROM 'standalone' THEN
    RAISE EXCEPTION 'the offer catalog is available to Solo workspaces only right now'
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
      _price_note := 'This offer''s price is connected to checkout, so it was not changed here.';
    ELSIF _price.kind IN ('deposit', 'installment') THEN
      _price_note := 'A deposit or instalment plan is not editable here, so it was left as it is.';
    ELSIF _price_amount IS NULL THEN
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
  -- Solo-only gate (this migration).
  _account_type   text;
  _parent_tenant  uuid;
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

  SELECT t.account_type, t.parent_tenant_id INTO _account_type, _parent_tenant
  FROM public.tenants t WHERE t.id = _tenant;

  IF _parent_tenant IS NOT NULL OR _account_type IS DISTINCT FROM 'standalone' THEN
    RAISE EXCEPTION 'the offer catalog is available to Solo workspaces only right now'
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
