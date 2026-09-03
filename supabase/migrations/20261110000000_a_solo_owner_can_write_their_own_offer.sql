-- Offer Catalog Slice 2B — the write seam for the tenant's own offer definition.
--
-- VERSION NOTE — 20261110000000, and this is the FIFTH collision across two slices.
--
-- 20261107000000 was free against both the repo and prod's ledger when it was chosen. #850's
-- follow-up then merged carrying that exact version, and `database-contract` caught it on the
-- from-zero replay:
--
--     Applying 20261107000000_a_solo_owner_can_write_their_own_offer.sql...
--     Applying 20261107000000_the_headline_is_the_furthest_the_email_got.sql...
--     ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
--     Key (version)=(20261107000000) already exists.
--
-- The check was not skipped; it was correct when it ran and stale by the time this pushed. That is
-- the same timing window Slice 2A hit four times, and it is now demonstrably a property of this
-- range rather than a lapse: five collisions, five different owners, none of them avoidable by
-- checking harder at the moment of choosing.
--
-- Chosen against BOTH maxima, which is the part the repo alone cannot tell you:
--     prod ledger max applied   20261108030000   (MCP query)
--     highest on any branch     20261109040000   (scan of all remote branches)
--     nothing at or above       20261110000000   in either
-- So this sorts after everything applied AND after everything in flight. Re-verify both
-- immediately before merge anyway — that is the only step that has ever caught this.
--
-- WHY AN RPC AND NOT THE EXISTING EDGE FUNCTION. `tenant-product-upsert` already writes
-- `tenant_products`, so extending it looks like the §18 answer. It is not, and the reason is §38.
-- That function mirrors every product into Stripe on the PLATFORM account, and says so in its own
-- header: the product "is sold via destination charges (see tenant-checkout-session) so it lives in
-- the platform's catalog". Destination charges make PAIGE the merchant of record for a tenant
-- selling to their own customer, which §38 names as the violation to fix before storefront
-- activation. Routing "record what my business sells" through it would attach a Stripe product on
-- Paige's account to every offer a tenant writes, and the owner's commerce boundary for this
-- program excludes Stripe/Connect actions entirely.
--
-- So the CATALOG DEFINITION and the STOREFRONT MIRROR are separated at the seam, not merged:
--   this RPC          — the tenant's commercial definition. Never touches Stripe.
--   tenant-product-upsert — the storefront/Stripe path. Untouched by this slice.
-- They coexist on one table with disjoint column concerns; this function never reads or writes
-- `stripe_product_id`, and never changes `status`. Converging them belongs to the commerce slice
-- that owns the §38 posture fix, and is recorded as owed rather than silently done here.
--
-- WHY NOT A DIRECT TABLE WRITE. RLS `tp_admin_manage` already permits a tenant admin to write this
-- table, so the browser could insert directly. Two reasons it does not: §10 wants one callable seam
-- PAIGE can drive by voice or text rather than a path only a React handler takes, and a direct
-- write cannot express optimistic concurrency or the workspace-switch refusal below.
--
-- The authority shape is copied deliberately from `remove_solo_team_member` (20261048000000) rather
-- than reinvented: session-resolved tenant, refusal-only expected-tenant, authority settled before
-- the row is looked up, and a row lock across the read-modify-write.

CREATE OR REPLACE FUNCTION public.save_solo_offer(
  _expected_tenant_id  uuid,
  _offer_id            uuid,          -- null creates
  _name                text,
  _summary             text   DEFAULT NULL,
  _description         text   DEFAULT NULL,
  _offer_kind          text   DEFAULT NULL,
  _delivery_shape      text   DEFAULT NULL,
  _price_presentation  text   DEFAULT NULL,
  _customer_action     text   DEFAULT NULL,
  _category            text   DEFAULT NULL,
  _price_amount        integer DEFAULT NULL,   -- MINOR units. null = no price stated.
  _price_currency      text   DEFAULT NULL,
  _price_interval      text   DEFAULT NULL,    -- one_time | day | week | month | year
  _expected_updated_at timestamptz DEFAULT NULL
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
  _clean    text;
  _currency text;
  _interval text;
  _kind     text;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  -- Refusal-only, exactly as remove_solo_team_member documents it: `current_user_tenant_id()` reads
  -- `profiles.active_tenant_id`, and switching workspaces writes that column BEFORE the browser's
  -- own state catches up. A form opened against one catalog must never be saved into another
  -- workspace the same person also belongs to. Disagreement aborts; it never redirects.
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  -- Authority BEFORE the row is looked up. Answering "no such offer" for a caller who was never
  -- entitled to ask turns a refusal into a catalog oracle for another workspace's ids.
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may change what this business sells'
      USING ERRCODE = '42501';
  END IF;

  -- The pack's rule, kept: "Save requires a name only."
  _clean := nullif(btrim(coalesce(_name, '')), '');
  IF _clean IS NULL THEN
    RAISE EXCEPTION 'an offer needs a name';
  END IF;

  -- Every classified field is validated HERE as well as by its CHECK, so the caller gets a sentence
  -- naming the field instead of a constraint name. Blank is normalised to NULL — "not stated" is a
  -- real answer and must not be stored as an empty string that reads as stated-but-empty.
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
     ('digital','physical','appointment','program','membership','hybrid') THEN
    RAISE EXCEPTION 'that is not a delivery shape this catalog records: %', _delivery_shape;
  END IF;
  IF _price_presentation IS NOT NULL AND _price_presentation NOT IN ('fixed','from','contact','none') THEN
    RAISE EXCEPTION 'that is not a way this catalog shows a price: %', _price_presentation;
  END IF;
  IF _customer_action IS NOT NULL AND _customer_action NOT IN ('buy','book','apply','enquire','learn') THEN
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
    -- Locked across the read-modify-write so two editors cannot interleave, and scoped to _tenant
    -- so a foreign id simply finds nothing rather than being refused informatively.
    SELECT * INTO _row
    FROM public.tenant_products p
    WHERE p.id = _offer_id AND p.tenant_id = _tenant
    FOR UPDATE;

    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'that offer is not in this catalog';
    END IF;

    -- Optimistic concurrency. The caller states the version it edited; if the row moved underneath
    -- it, the save is refused rather than silently overwriting the other person's change. Callers
    -- that pass NULL opt out, which is what a first save after a create does.
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

  -- ONE price row, deliberately. A real catalog has plans, tiers and instalments; 2A already RENDERS
  -- all of them, and this slice does not pretend to author them. What it writes is the single lead
  -- price the editor collects, at sort_order 0. Anything else already on the offer is left exactly
  -- as it is — including rows written by the storefront panel, which this must not silently discard.
  IF _price_amount IS NOT NULL THEN
    IF _price_amount < 0 THEN
      RAISE EXCEPTION 'a price cannot be negative';
    END IF;

    _currency := lower(nullif(btrim(coalesce(_price_currency, '')), ''));
    _currency := coalesce(_currency, 'usd');
    IF _currency !~ '^[a-z]{3}$' THEN
      RAISE EXCEPTION 'a currency is a three-letter code, not %', _currency;
    END IF;

    _interval := nullif(btrim(coalesce(_price_interval, '')), '');
    _interval := coalesce(_interval, 'one_time');
    IF _interval NOT IN ('one_time','day','week','month','year') THEN
      RAISE EXCEPTION 'that is not a billing period this catalog records: %', _interval;
    END IF;

    -- kind is DERIVED from the period rather than asked for, because the two disagreeing is exactly
    -- the defect 2A's read had to render around: a plan whose kind said one thing and whose interval
    -- said another. One answer, computed once.
    _kind := CASE WHEN _interval = 'one_time' THEN 'one_time' ELSE 'recurring' END;

    UPDATE public.tenant_prices
       SET unit_amount      = _price_amount,
           currency         = _currency,
           billing_interval = _interval,
           kind             = _kind,
           active           = true
     WHERE tenant_id = _tenant AND product_id = _row.id AND sort_order = 0;

    IF NOT FOUND THEN
      INSERT INTO public.tenant_prices
        (tenant_id, product_id, unit_amount, currency, billing_interval, kind, sort_order, active)
      VALUES
        (_tenant, _row.id, _price_amount, _currency, _interval, _kind, 0, true);
    END IF;
  END IF;

  RETURN jsonb_build_object('id', _row.id, 'updated_at', _row.updated_at, 'status', _row.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz) TO authenticated;

COMMENT ON FUNCTION public.save_solo_offer(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,timestamptz) IS
  'Slice 2B. Writes the tenant''s own offer DEFINITION on tenant_products, scoped to the session''s '
  'workspace. Never touches Stripe (§38) and never changes status — lifecycle is set_solo_offer_status.';

-- ---------------------------------------------------------------------------------------------
-- LIFECYCLE, kept separate from the editor on purpose.
--
-- The Platform Operator pack (super-admin-shell-v3/campaigns-catalog-sales-spec.md) says state is
-- DERIVED and "Do not expose a status picker". That rule cannot be ported here as drawn: it derives
-- state from price plus the channels an offer sells on, and Solo has neither `where[]` nor the
-- pack's four kinds — while 2A shipped, and the owner ruled, a RECORDED status whose 'paused' is
-- explicitly the state no derivation can infer (a barber pausing a service, a kit paused while a
-- supplier changes). Both cannot hold. The contradiction is raised for the owner and Claude Design
-- rather than settled here; this function implements the SHIPPED model, and the transitions below
-- are the lifecycle, not a free-form picker over the CHECK.
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
  _actor  uuid := auth.uid();
  _tenant uuid := public.current_user_tenant_id();
  _row    public.tenant_products;
  _next   text := nullif(btrim(coalesce(_next_status, '')), '');
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

  IF _next IS NULL OR _next NOT IN ('draft','active','paused','archived') THEN
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

  -- Idempotent rather than an error: a double-submit, or a second tab, must not produce a failure
  -- for a state the record is already in. The caller asked for an outcome, and the outcome holds.
  IF _row.status = _next THEN
    RETURN jsonb_build_object('id', _row.id, 'status', _row.status,
                              'updated_at', _row.updated_at, 'changed', false);
  END IF;

  -- Publishing is the one transition that makes an offer PUBLICLY readable: RLS `tp_public_active_read`
  -- exposes status='active' rows on a storefront-enabled tenant to anon. So it refuses on a record
  -- that would publish a claim the tenant never made — an offer with no price and no explicit
  -- "price on application" is not ready to face a customer, and 2A renders exactly that ambiguity.
  IF _next = 'active'
     AND _row.price_presentation IS DISTINCT FROM 'contact'
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_prices tp
       WHERE tp.product_id = _row.id AND tp.tenant_id = _tenant AND tp.active
     ) THEN
    RAISE EXCEPTION 'give this offer a price, or say the price is on application, before it goes live';
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

COMMENT ON FUNCTION public.set_solo_offer_status(uuid,uuid,text,timestamptz) IS
  'Slice 2B. Moves one offer between draft/active/paused/archived in the session''s workspace. '
  'Idempotent, refuses to publish an offer that states no price, and never touches Stripe (§38).';
