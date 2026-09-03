-- Sales Operations Slice 2 — the terms one client agreed to.
--
-- ─── WHAT THIS IS, AND WHAT CATALOG STAYS ────────────────────────────────────────────────────
--
-- Catalog (`tenant_products` + `tenant_prices`) is what the business SELLS. It stays the only
-- source of truth for that, and nothing here writes to it. An AGREEMENT is the different fact:
-- what ONE named client agreed to, on terms that may not be the list terms. The two are linked by
-- id and by a dated snapshot, never by copying the catalog's price into a second editable home.
--
-- ─── WHY NOT tenant_service_subscriptions ────────────────────────────────────────────────────
--
-- Owner ruling, 2026-09-03: do not stretch it. Inspected before accepting that: it has NO amount
-- column at all, `billing_period` is free text with no CHECK, `status` has no CHECK, and its
-- `current_period_start` is rewritten by Stripe webhooks — so a negotiated start date would not
-- survive. It is a PROVIDER-subscription mirror. This is a commercial RECORD, and nothing about it
-- implies a charge, an invoice, a provider subscription, a collection, a refund or a tax position.
-- §38: Paige is never merchant of record for a tenant→client charge, and this table cannot make
-- it one — it stores what was agreed, not anything that moves money.
--
-- ─── VERSION ─────────────────────────────────────────────────────────────────────────────────
--
-- 20261200000000, and the number was NOT the first choice.
--
-- Chosen as 20261180000000 against a prod ledger and an all-branch scan that both topped out at
-- 20261170000000. Re-verified immediately before commit, as the rule requires — and 20261180000000
-- was by then TAKEN and APPLIED on prod by `tenant_people_admin_gate_is_tenant_scoped` (#885),
-- which merged while this slice was being built. That is the THIRD live collision this re-verify
-- step has caught on this branch, which is why it is a step and not a courtesy.
--
-- State at commit: prod ledger max 20261180000000 · highest on any remote branch 20261180000000.
-- 20261200000000 sorts strictly after both, deliberately skipping the 2026119x band in case
-- another slice is moving in it unmerged. Re-verify again if this sits unmerged: the base moves
-- after you look at it.
--
-- ─── THE PLURALITY, CHECKED RATHER THAN ASSUMED ──────────────────────────────────────────────
--
-- `contact_id` for the client FK: 40 tables spell it that way against 23 using `client_id`, and it
-- is the spelling `paige_coach_assignments` uses — which matters, because `is_assigned_to_client()`
-- keys on it and the RLS below defers to that function. Deliberately NOT `end_customer_contact_id`
-- (the two-table spelling `tenant_service_subscriptions` and `platform_metered_events` use): those
-- rows carry a Paige-side billing meaning and this one must carry none.

CREATE TABLE IF NOT EXISTS public.tenant_client_agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOT NULL: every §9 predicate below keys on it. `clients` and `deals` both carry a
  -- `tenant_id IS NULL OR ...` escape hatch in their isolation policies; that hatch is not
  -- reproduced here, and the NOT NULL is what makes reproducing it unnecessary.
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- RESTRICT, not CASCADE. Deleting a client who has a live agreement must fail loudly rather
  -- than silently taking the commercial record with it.
  contact_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,

  -- Exactly ONE canonical Catalog offer. RESTRICT costs nothing real because tenants ARCHIVE
  -- offers (`tenant_products.status='archived'`) rather than delete them, and it stops an
  -- agreement pointing at a name that no longer exists.
  offer_id     uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE RESTRICT,

  title        text,
  notes        text,

  -- ── TERMS ───────────────────────────────────────────────────────────────────────────────────
  -- The shape of the deal. Every CHECK below branches on it. Four of the five mirror
  -- `tenant_prices.kind`; `custom_quote` is the agreement-only fifth, for bespoke scope with no
  -- catalog plan shape. The owner's instruction was not to artificially restrict what a Solo
  -- business can sell, which is what `custom_quote` exists for.
  term_kind    text NOT NULL
    CHECK (term_kind IN ('one_time','recurring','installment','deposit','custom_quote')),

  -- Allow-list copied from `save_solo_offer` so the two seams cannot drift apart.
  billing_interval   text
    CHECK (billing_interval IS NULL OR billing_interval IN ('one_time','day','week','month','year')),
  interval_count     integer CHECK (interval_count IS NULL OR interval_count >= 1),
  installments_total integer CHECK (installments_total IS NULL OR installments_total >= 2),

  -- WHEN money is due. Descriptive only: nothing schedules, charges, invoices or duns off it.
  payment_schedule   text
    CHECK (payment_schedule IS NULL OR payment_schedule IN
           ('on_signing','on_start','in_advance','in_arrears','on_milestone','custom')),

  -- ── THE PRICE, IN TWO HALVES THAT CANNOT BE CONFLATED ───────────────────────────────────────
  price_basis  text NOT NULL CHECK (price_basis IN ('catalog','negotiated','quote_pending')),

  -- What THIS client agreed to pay, in MINOR units (bigint, matching `deals.value_cents`).
  agreed_amount_minor bigint CHECK (agreed_amount_minor IS NULL OR agreed_amount_minor >= 0),
  agreed_currency     text   CHECK (agreed_currency IS NULL OR agreed_currency ~ '^[a-z]{3}$'),

  -- What the CATALOG said at the moment this was written. Captured SERVER-SIDE off
  -- `tenant_prices`, never supplied by the browser, never written back, and immutable once set
  -- (trigger below). A snapshot that can move is not a snapshot.
  catalog_price_id                uuid REFERENCES public.tenant_prices(id) ON DELETE SET NULL,
  catalog_price_snapshot_minor    bigint,
  catalog_price_snapshot_currency text
    CHECK (catalog_price_snapshot_currency IS NULL OR catalog_price_snapshot_currency ~ '^[a-z]{3}$'),
  catalog_price_snapshot_interval text,
  catalog_price_snapshot_kind     text,
  catalog_price_snapshot_at       timestamptz,

  -- ── DATES ───────────────────────────────────────────────────────────────────────────────────
  starts_on    date,
  renews_on    date,
  ends_on      date,

  -- ── STATE ───────────────────────────────────────────────────────────────────────────────────
  -- Owner-ruled set, 2026-09-03: "draft, active, paused, completed/cancelled as supported by the
  -- actual model. Do not fabricate payment or fulfillment status." So there is no 'paid', no
  -- 'delivered', no 'invoiced' — this table cannot observe any of those and will not pretend to.
  --
  -- 'ready' and 'unavailable' were in an earlier draft of this set and are deliberately ABSENT:
  -- both are already taken on this exact surface as hook PHASES (`phase: "ready"`,
  -- `phase: "unavailable"` renders "Sales needs a resolved workspace"), so one word would have
  -- carried two unrelated meanings on one screen.
  status       text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','completed','cancelled')),

  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- ── CONSTRAINTS THAT MAKE THE MODEL HONEST ──────────────────────────────────────────────────

  -- 'catalog' is a PROVABLE claim, not a label: the row must carry the dated list price it was
  -- taken from. It does NOT assert that the two are still equal FOREVER, and an earlier draft of
  -- this constraint did. That version made a catalog-basis row permanently uneditable the moment
  -- the offer's list price moved — the RPC re-read the live price while the snapshot stayed
  -- frozen, so changing only the notes was refused. What the row asserts is what was true AT
  -- SIGNING, and the dated snapshot beside the agreed figure is that proof.
  CONSTRAINT tca_price_basis_catalog_ck CHECK (
    price_basis <> 'catalog' OR (
      agreed_amount_minor IS NOT NULL
      AND catalog_price_snapshot_minor IS NOT NULL)),

  CONSTRAINT tca_price_basis_negotiated_ck CHECK (
    price_basis <> 'negotiated' OR agreed_amount_minor IS NOT NULL),

  -- The one state where "no number yet" is a legitimate answer rather than missing data.
  CONSTRAINT tca_price_basis_quote_ck CHECK (
    price_basis <> 'quote_pending'
    OR (agreed_amount_minor IS NULL AND term_kind = 'custom_quote')),

  -- An amount without its currency is unreadable, because the minor-unit exponent is a property
  -- of the currency: 500 is ¥500 in JPY (0 digits) and $5.00 in USD (2). The repo already shipped
  -- and fixed that exact bug — a hardcoded /100 rendered a recorded ¥500 as "5 JPY". The two
  -- travel together or not at all.
  CONSTRAINT tca_amount_needs_currency_ck CHECK (
    (agreed_amount_minor IS NULL) = (agreed_currency IS NULL)),
  CONSTRAINT tca_snapshot_needs_currency_ck CHECK (
    (catalog_price_snapshot_minor IS NULL) = (catalog_price_snapshot_currency IS NULL)),

  -- A snapshot with no capture time cannot be dated, so it is not evidence.
  CONSTRAINT tca_snapshot_needs_time_ck CHECK (
    (catalog_price_snapshot_minor IS NULL) = (catalog_price_snapshot_at IS NULL)),

  -- The whole point of the snapshot is the pair "agreed vs listed". Two currencies makes that
  -- pair incomparable, and this system has no FX source to reconcile them with.
  CONSTRAINT tca_currencies_comparable_ck CHECK (
    agreed_currency IS NULL OR catalog_price_snapshot_currency IS NULL
    OR agreed_currency = catalog_price_snapshot_currency),

  -- Cadence belongs to the term shape that has one.
  CONSTRAINT tca_recurring_needs_cadence_ck CHECK (
    term_kind <> 'recurring'
    OR (billing_interval IS NOT NULL AND billing_interval <> 'one_time'
        AND interval_count IS NOT NULL)),
  CONSTRAINT tca_installment_needs_count_ck CHECK (
    term_kind <> 'installment' OR installments_total IS NOT NULL),
  CONSTRAINT tca_one_time_has_no_cadence_ck CHECK (
    term_kind <> 'one_time'
    OR (installments_total IS NULL
        AND (billing_interval IS NULL OR billing_interval = 'one_time'))),

  -- Only a recurring agreement renews.
  CONSTRAINT tca_renewal_is_recurring_ck CHECK (renews_on IS NULL OR term_kind = 'recurring'),
  CONSTRAINT tca_dates_ordered_ck CHECK (
    (renews_on IS NULL OR starts_on IS NULL OR renews_on >= starts_on)
    AND (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)),

  -- A draft may be incomplete, and so may an ABANDONED one. `cancelled` is exempt because
  -- cancelling IS abandonment: requiring a start date before you may walk away made the commonest
  -- row in the table — a half-finished draft — permanently uncancellable. Reproduced before this
  -- was written: the UPDATE was refused and the row stayed `draft`.
  CONSTRAINT tca_committed_is_complete_ck CHECK (
    status IN ('draft','cancelled')
    OR (starts_on IS NOT NULL AND price_basis <> 'quote_pending'))
);

-- One LIVE agreement per client per offer. Completed and cancelled history is kept, so this is
-- partial rather than a blanket UNIQUE — a client can re-sign for the same offer next year.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tca_live_per_client_offer
  ON public.tenant_client_agreements (tenant_id, contact_id, offer_id)
  WHERE status IN ('active','paused');

CREATE INDEX IF NOT EXISTS idx_tca_tenant_status ON public.tenant_client_agreements (tenant_id, status);
-- Carries the RLS EXISTS below; without it every visibility check is a sequential scan.
CREATE INDEX IF NOT EXISTS idx_tca_contact ON public.tenant_client_agreements (contact_id);
CREATE INDEX IF NOT EXISTS idx_tca_offer   ON public.tenant_client_agreements (offer_id);

CREATE TRIGGER tca_set_updated_at BEFORE UPDATE ON public.tenant_client_agreements
  FOR EACH ROW EXECUTE FUNCTION public.tenant_set_updated_at();

-- `stamp_tenant_id` is deliberately NOT attached. It only fills `tenant_id` when NULL, and with a
-- NOT NULL column whose sole writer is the DEFINER function below, a NULL can never arrive. A
-- trigger that cannot fire is noise in the schema, not insurance.

COMMENT ON TABLE public.tenant_client_agreements IS
  'What ONE client agreed to: a canonical Catalog offer on this client''s negotiated terms. '
  'Catalog remains the source of truth for what the business sells; this never writes to it. '
  'Records no payment, invoice, provider subscription, collection, refund or tax position (§38).';

-- ─── RLS: THE AGREEMENT INHERITS ITS CLIENT'S VISIBILITY ─────────────────────────────────────
--
-- The asymmetry this avoids, stated precisely. `tenant_service_subscriptions` reads
-- `tenant_id = current_user_tenant_id()` with NO role predicate and no restrictive policy, so any
-- active member reads every row — while `clients` gives that same member ZERO rows. A member
-- therefore sees a subscription naming a client id and an amount, and cannot resolve who it is.
-- Copying that shape here would reproduce it with a NEGOTIATED PRICE attached, which is strictly
-- worse. So an agreement is visible if and only if its client is visible, plus a hard tenant gate.
--
-- WHAT INHERITING ALSO INHERITS — stated rather than glossed (§13). `clients_admins_full` is
-- `has_any_role(auth.uid(), ARRAY['admin','super_admin']) AND tenant_id = current_user_tenant_id()`,
-- and `has_any_role` reads `public.user_roles`, which has NO tenant column. So a person who is
-- owner/admin of ANY tenant and merely a member of another can read that other tenant's client
-- book — and, through the EXISTS below, the agreements in it. This is a `clients`-owned defect and
-- is NOT widened from here, but it means "a plain member sees ZERO" is true of the tenant-member
-- ROLE and not a guarantee about every caller. Measured on prod at the time of writing: the shape
-- returns zero rows — all active members are owner/admin of their own tenant only — so the
-- exposure is latent, not live. Re-run that shape query before each release rather than assuming.
--
-- FUTURE CONSTRAINT, recorded because it is a real one: if `clients` ever gains a policy that
-- references `tenant_client_agreements`, Postgres will error on mutual recursion. The dependency
-- is one-directional by design and must stay that way.
ALTER TABLE public.tenant_client_agreements ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE, mirroring `clients.tenant_isolation` — but without its `tenant_id IS NULL OR`
-- escape hatch, which the NOT NULL column makes unnecessary.
DROP POLICY IF EXISTS tca_tenant_isolation ON public.tenant_client_agreements;
CREATE POLICY tca_tenant_isolation ON public.tenant_client_agreements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id())
  WITH CHECK (public.is_platform_owner() OR tenant_id = public.current_user_tenant_id());

-- PERMISSIVE, SELECT only. The EXISTS is evaluated under the CALLER's own RLS on `clients`, so
-- all ten of that table's policies apply here with no restatement and therefore no drift.
--
-- The restrictive policy above is what makes this safe rather than clever: `clients` carries
-- `clients_linked_self_read` (`linked_user_id = auth.uid()`), so a naive EXISTS alone would have
-- silently granted every PORTAL CLIENT read access to their own agreement's terms — a capability
-- nobody specified. A portal client is not in `tenant_members`, so `current_user_tenant_id()` does
-- not resolve to this tenant and the restrictive gate refuses first.
DROP POLICY IF EXISTS tca_visible_with_its_client ON public.tenant_client_agreements;
CREATE POLICY tca_visible_with_its_client ON public.tenant_client_agreements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = contact_id));

-- No INSERT/UPDATE/DELETE policy exists, on purpose: the DEFINER functions below are the ONLY
-- writers, so there is no second write path for a producer inventory to miss (§37). The table ACL
-- matches the posture `clients` already carries (`authenticated=rwdDxtm` — no INSERT).
REVOKE ALL ON TABLE public.tenant_client_agreements FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_client_agreements FROM anon;
GRANT SELECT ON TABLE public.tenant_client_agreements TO authenticated;

-- ─── THE SNAPSHOT CANNOT MOVE ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_agreement_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.catalog_price_snapshot_at IS NOT NULL AND (
       NEW.catalog_price_snapshot_minor    IS DISTINCT FROM OLD.catalog_price_snapshot_minor
    OR NEW.catalog_price_snapshot_currency IS DISTINCT FROM OLD.catalog_price_snapshot_currency
    OR NEW.catalog_price_snapshot_interval IS DISTINCT FROM OLD.catalog_price_snapshot_interval
    OR NEW.catalog_price_snapshot_kind     IS DISTINCT FROM OLD.catalog_price_snapshot_kind
    OR NEW.catalog_price_snapshot_at       IS DISTINCT FROM OLD.catalog_price_snapshot_at)
  THEN
    RAISE EXCEPTION 'the recorded catalog price is a dated snapshot and cannot be rewritten'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_agreement_snapshot_immutable ON public.tenant_client_agreements;
CREATE TRIGGER trg_agreement_snapshot_immutable
  BEFORE UPDATE ON public.tenant_client_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_snapshot_immutable();

-- ─── THE LINKS MUST RESOLVE INSIDE THE ROW'S OWN TENANT ──────────────────────────────────────
--
-- `contact_id uuid NOT NULL REFERENCES public.clients(id)` proves the client EXISTS. It does not
-- prove the client is YOURS, and those are different facts. The RPC below proves ownership — but
-- the RPC is not the only conceivable writer: a `service_role` caller (a future edge function, or
-- Paige's own headless agent, which §10 requires the seam to allow) bypasses RLS entirely and
-- could write `tenant_id = A` against a client of tenant B.
--
-- The consequence was measured rather than imagined: such a row is invisible to EVERY normal
-- caller — including its own tenant's owner, because the read policy asks whether the CLIENT is
-- visible and that client belongs to someone else — while still occupying the
-- `uq_tca_live_per_client_offer` slot. Silent dark data that blocks a legitimate later agreement.
-- So the tenancy proof lives in the database, where every writer meets it.
CREATE OR REPLACE FUNCTION public.enforce_agreement_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c
                  WHERE c.id = NEW.contact_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that client belongs to a different workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_products p
                  WHERE p.id = NEW.offer_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'that offer belongs to a different workspace' USING ERRCODE = '42501';
  END IF;
  IF NEW.catalog_price_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_prices pr
                      WHERE pr.id = NEW.catalog_price_id
                        AND pr.tenant_id = NEW.tenant_id
                        AND pr.product_id = NEW.offer_id) THEN
    RAISE EXCEPTION 'that price is not a plan on this offer in this workspace' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_agreement_tenant_links ON public.tenant_client_agreements;
CREATE TRIGGER trg_agreement_tenant_links
  BEFORE INSERT OR UPDATE ON public.tenant_client_agreements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agreement_tenant_links();

-- A trigger function is only ever invoked by the trigger, but SECURITY DEFINER inherits
-- PostgreSQL's default `EXECUTE TO PUBLIC`, so both are revoked rather than left to inertness.
REVOKE ALL ON FUNCTION public.enforce_agreement_tenant_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_agreement_tenant_links() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_agreement_snapshot_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_agreement_snapshot_immutable() FROM anon;

-- ─── THE WRITER ──────────────────────────────────────────────────────────────────────────────
--
-- Copied from `save_solo_offer` / `declare_client_payment_handling` rather than reinvented:
-- session-resolved tenant, refusal-only expected-tenant, authority settled before any row is
-- touched, allow-lists restated so the caller gets a sentence rather than a constraint name, and
-- the written row read back so the surface can never echo what it sent (§13).
--
-- §59: this is SECURITY DEFINER, so it bypasses RLS on `clients`, `tenant_products` and
-- `tenant_prices`. The body re-enforces the caller's scope itself. The EXECUTE grant is never the
-- guard.
CREATE OR REPLACE FUNCTION public.save_client_agreement(
  _expected_tenant_id  uuid,
  _agreement_id        uuid,                     -- null creates
  _contact_id          uuid,
  _offer_id            uuid,
  _term_kind           text,
  _price_basis         text,
  _catalog_price_id    uuid        DEFAULT NULL, -- an ID only. Never an amount.
  _agreed_amount_minor bigint      DEFAULT NULL, -- MINOR units
  _agreed_currency     text        DEFAULT NULL,
  _billing_interval    text        DEFAULT NULL,
  _interval_count      integer     DEFAULT NULL,
  _installments_total  integer     DEFAULT NULL,
  _payment_schedule    text        DEFAULT NULL,
  _starts_on           date        DEFAULT NULL,
  _renews_on           date        DEFAULT NULL,
  _ends_on             date        DEFAULT NULL,
  _title               text        DEFAULT NULL,
  _notes               text        DEFAULT NULL,
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
  _row    public.tenant_client_agreements;
  _price  public.tenant_prices;
  _snap_minor    bigint;
  _snap_currency text;
  _snap_interval text;
  _snap_kind     text;
  _snap_at       timestamptz;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;

  -- Refusal-only. `current_user_tenant_id()` reads `profiles.active_tenant_id`, which a workspace
  -- switch writes BEFORE the browser catches up, so an agreement drafted against one workspace
  -- must never land in another the same person also belongs to. Disagreement aborts; never
  -- redirects. The caller must send the tenant the FORM WAS OPENED AGAINST, not the current one —
  -- sending the current one makes the guard unable to fire, because the caller keeps agreeing
  -- with itself. That exact mistake shipped once on `save_solo_offer` and is recorded there.
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;

  -- Settled BEFORE the ids are resolved. Answering "no such client" to a caller who was never
  -- entitled to ask turns a refusal into a client-directory oracle for another workspace.
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may record an agreement with a client'
      USING ERRCODE = '42501';
  END IF;

  -- ── THE IDOR SURFACE. Both ids came from the browser. ─────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS on `clients`, so `AND c.tenant_id = _tenant` is the ONLY thing
  -- standing between this and a foreign client. It is not decorative.
  PERFORM 1 FROM public.clients c WHERE c.id = _contact_id AND c.tenant_id = _tenant;
  IF NOT FOUND THEN
    -- One sentence for "absent" and "not yours" alike. Telling them apart is the oracle.
    RAISE EXCEPTION 'that client is not in this workspace';
  END IF;

  PERFORM 1 FROM public.tenant_products p WHERE p.id = _offer_id AND p.tenant_id = _tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'that offer is not in this catalog';
  END IF;

  -- ── VALIDATION ────────────────────────────────────────────────────────────────────────────
  _term_kind        := nullif(btrim(coalesce(_term_kind, '')), '');
  _price_basis      := nullif(btrim(coalesce(_price_basis, '')), '');
  _billing_interval := nullif(btrim(coalesce(_billing_interval, '')), '');
  _payment_schedule := nullif(btrim(coalesce(_payment_schedule, '')), '');
  _agreed_currency  := lower(nullif(btrim(coalesce(_agreed_currency, '')), ''));
  _title            := nullif(btrim(coalesce(_title, '')), '');
  _notes            := nullif(btrim(coalesce(_notes, '')), '');

  IF _term_kind IS NULL OR _term_kind NOT IN
     ('one_time','recurring','installment','deposit','custom_quote') THEN
    RAISE EXCEPTION 'that is not a kind of arrangement this workspace records: %',
      coalesce(_term_kind, 'nothing');
  END IF;
  IF _price_basis IS NULL OR _price_basis NOT IN ('catalog','negotiated','quote_pending') THEN
    RAISE EXCEPTION 'say whether this is the catalog price, a negotiated price, or a quote still to come';
  END IF;
  IF _billing_interval IS NOT NULL
     AND _billing_interval NOT IN ('one_time','day','week','month','year') THEN
    RAISE EXCEPTION 'that is not a billing interval this workspace records: %', _billing_interval;
  END IF;
  IF _payment_schedule IS NOT NULL AND _payment_schedule NOT IN
     ('on_signing','on_start','in_advance','in_arrears','on_milestone','custom') THEN
    RAISE EXCEPTION 'that is not a payment schedule this workspace records: %', _payment_schedule;
  END IF;
  IF _agreed_currency IS NOT NULL AND _agreed_currency !~ '^[a-z]{3}$' THEN
    RAISE EXCEPTION 'a currency is a three-letter code, not %', _agreed_currency;
  END IF;
  IF _agreed_amount_minor IS NOT NULL AND _agreed_amount_minor < 0 THEN
    RAISE EXCEPTION 'an agreed amount cannot be negative';
  END IF;

  -- ── CROSS-FIELD VALIDATION, SO NO CONSTRAINT NAME EVER REACHES A PERSON ───────────────────
  -- The allow-lists above cover single fields. These cover the combinations, and each one exists
  -- because the CHECK behind it would otherwise surface as
  -- `violates check constraint "tca_..."` — a table name and a constraint name in visible copy.
  -- The first of them was reachable in TWO CLICKS from the empty state.
  IF _price_basis = 'quote_pending' THEN
    IF _term_kind <> 'custom_quote' THEN
      RAISE EXCEPTION 'a price still to be quoted only makes sense on a custom arrangement; choose Custom, or say what they agreed to pay';
    END IF;
    IF _agreed_amount_minor IS NOT NULL THEN
      RAISE EXCEPTION 'this is recorded as still to be quoted, so it cannot also carry an amount';
    END IF;
  END IF;

  IF _price_basis = 'negotiated' AND _agreed_amount_minor IS NULL THEN
    RAISE EXCEPTION 'say what this client agreed to pay, or record it as still to be quoted';
  END IF;

  IF (_agreed_amount_minor IS NULL) <> (_agreed_currency IS NULL) THEN
    -- The minor-unit exponent is a property of the currency, so an amount without one cannot be
    -- read back at all: 500 is ¥500 in JPY and $5.00 in USD.
    RAISE EXCEPTION 'an amount needs its currency, and a currency needs its amount';
  END IF;

  IF _term_kind = 'recurring' AND (_billing_interval IS NULL OR _billing_interval = 'one_time') THEN
    RAISE EXCEPTION 'a recurring arrangement needs to say how often — weekly, monthly or yearly';
  END IF;
  IF _term_kind = 'installment' AND _installments_total IS NULL THEN
    RAISE EXCEPTION 'an instalment arrangement needs to say how many instalments (two or more)';
  END IF;
  IF _installments_total IS NOT NULL AND _installments_total < 2 THEN
    RAISE EXCEPTION 'instalments come in twos or more; one payment is a one-off';
  END IF;
  IF _term_kind = 'one_time'
     AND (_installments_total IS NOT NULL
          OR (_billing_interval IS NOT NULL AND _billing_interval <> 'one_time')) THEN
    RAISE EXCEPTION 'a one-off does not repeat, so it cannot carry a cadence or an instalment count';
  END IF;

  IF _renews_on IS NOT NULL AND _term_kind <> 'recurring' THEN
    RAISE EXCEPTION 'only a recurring arrangement renews';
  END IF;
  IF _renews_on IS NOT NULL AND _starts_on IS NOT NULL AND _renews_on < _starts_on THEN
    RAISE EXCEPTION 'a renewal date cannot fall before the start date';
  END IF;
  IF _ends_on IS NOT NULL AND _starts_on IS NOT NULL AND _ends_on < _starts_on THEN
    RAISE EXCEPTION 'an end date cannot fall before the start date';
  END IF;

  -- ── THE SNAPSHOT, READ SERVER-SIDE ────────────────────────────────────────────────────────
  -- The browser sends an ID and never an amount, so it cannot forge what the catalog said. The
  -- price row must belong to this tenant AND to the offer being agreed — a price row from a
  -- different offer is a real row this caller may legitimately see, and still a lie here.
  IF _catalog_price_id IS NOT NULL THEN
    SELECT * INTO _price FROM public.tenant_prices
     WHERE id = _catalog_price_id AND tenant_id = _tenant AND product_id = _offer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'that price is not a plan on this offer in this workspace';
    END IF;
    _snap_minor    := _price.unit_amount;
    _snap_currency := lower(_price.currency);
    _snap_interval := _price.billing_interval;
    _snap_kind     := _price.kind;
    _snap_at       := now();
  END IF;

  -- 'catalog' means "this client pays list", which is only sayable when a list price was read.
  -- On CREATE, 'catalog' means the agreed figure IS the list price, so it is taken from the
  -- snapshot rather than from the caller — who does not get to disagree with itself. On EDIT it is
  -- deliberately NOT re-derived: the list price may have moved since, and re-reading it would
  -- silently rewrite what this client agreed to pay.
  IF _price_basis = 'catalog' AND _agreement_id IS NULL THEN
    IF _snap_minor IS NULL THEN
      RAISE EXCEPTION 'choose which catalog plan this agreement follows before recording it as the catalog price';
    END IF;
    _agreed_amount_minor := _snap_minor;
    _agreed_currency     := _snap_currency;
  END IF;

  IF _agreement_id IS NULL THEN
    INSERT INTO public.tenant_client_agreements
      (tenant_id, contact_id, offer_id, title, notes, term_kind, billing_interval, interval_count,
       installments_total, payment_schedule, price_basis, agreed_amount_minor, agreed_currency,
       catalog_price_id, catalog_price_snapshot_minor, catalog_price_snapshot_currency,
       catalog_price_snapshot_interval, catalog_price_snapshot_kind, catalog_price_snapshot_at,
       starts_on, renews_on, ends_on, status, created_by)
    VALUES
      (_tenant, _contact_id, _offer_id, _title, _notes, _term_kind, _billing_interval,
       _interval_count, _installments_total, _payment_schedule, _price_basis,
       _agreed_amount_minor, _agreed_currency, _catalog_price_id, _snap_minor, _snap_currency,
       _snap_interval, _snap_kind, _snap_at, _starts_on, _renews_on, _ends_on, 'draft', _actor)
    RETURNING * INTO _row;
  ELSE
    -- Optimistic concurrency. The field at risk is money a client owes, and a multi-field
    -- negotiated record is exactly the shape where two editors produce a silently merged wrong
    -- number. 40001 is the code `useCatalogOffers.runWrite` already maps to `stale`, and the
    -- surface already offers RELOAD rather than retry — a retry would overwrite the other writer.
    UPDATE public.tenant_client_agreements
       SET contact_id = _contact_id,
           offer_id = _offer_id,
           title = _title,
           notes = _notes,
           term_kind = _term_kind,
           billing_interval = _billing_interval,
           interval_count = _interval_count,
           installments_total = _installments_total,
           payment_schedule = _payment_schedule,
           price_basis = _price_basis,
           agreed_amount_minor = _agreed_amount_minor,
           agreed_currency = _agreed_currency,
           -- The snapshot is only ever SET, never re-set: coalesce keeps the original dated
           -- reading, and the immutability trigger refuses any attempt to move it.
           catalog_price_id = coalesce(catalog_price_id, _catalog_price_id),
           catalog_price_snapshot_minor = coalesce(catalog_price_snapshot_minor, _snap_minor),
           catalog_price_snapshot_currency = coalesce(catalog_price_snapshot_currency, _snap_currency),
           catalog_price_snapshot_interval = coalesce(catalog_price_snapshot_interval, _snap_interval),
           catalog_price_snapshot_kind = coalesce(catalog_price_snapshot_kind, _snap_kind),
           catalog_price_snapshot_at = coalesce(catalog_price_snapshot_at, _snap_at),
           starts_on = _starts_on,
           renews_on = _renews_on,
           ends_on = _ends_on
     WHERE id = _agreement_id
       AND tenant_id = _tenant
       AND (_expected_updated_at IS NULL OR updated_at = _expected_updated_at)
    RETURNING * INTO _row;

    IF _row.id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.tenant_client_agreements
                  WHERE id = _agreement_id AND tenant_id = _tenant) THEN
        RAISE EXCEPTION 'someone else changed this agreement while you were editing it'
          USING ERRCODE = '40001';
      END IF;
      RAISE EXCEPTION 'that agreement is not in this workspace';
    END IF;
  END IF;

  -- Reports what was ACTUALLY written, read back off the row (§13), so a value the database
  -- normalised or refused can never be shown back as though it had been stored.
  RETURN to_jsonb(_row);
END;
$function$;

-- ─── THE LIFECYCLE ───────────────────────────────────────────────────────────────────────────
--
-- Split from the editor for the same reason `set_solo_offer_status` is split from
-- `save_solo_offer`: different preconditions. Moving an agreement to `active` asserts it is
-- complete; editing its notes does not.
CREATE OR REPLACE FUNCTION public.set_client_agreement_status(
  _expected_tenant_id  uuid,
  _agreement_id        uuid,
  _status              text,
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
  _row    public.tenant_client_agreements;
BEGIN
  IF _actor IS NULL OR _tenant IS NULL THEN
    RAISE EXCEPTION 'authentication required in an active workspace' USING ERRCODE = '42501';
  END IF;
  IF _expected_tenant_id IS DISTINCT FROM _tenant THEN
    RAISE EXCEPTION 'your active workspace changed before this could save; nothing was written'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tenant_admin(_tenant) THEN
    RAISE EXCEPTION 'only an owner or admin may change an agreement''s state'
      USING ERRCODE = '42501';
  END IF;

  _status := nullif(btrim(coalesce(_status, '')), '');
  IF _status IS NULL OR _status NOT IN ('draft','active','paused','completed','cancelled') THEN
    RAISE EXCEPTION 'that is not a state an agreement can be in: %', coalesce(_status, 'nothing');
  END IF;

  -- A cancelled or completed agreement is HISTORY. Reopening it would rewrite what a client owed
  -- and when, so a new arrangement is a new record rather than a resurrected one.
  SELECT * INTO _row FROM public.tenant_client_agreements
   WHERE id = _agreement_id AND tenant_id = _tenant;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'that agreement is not in this workspace';
  END IF;
  IF _row.status IN ('completed', 'cancelled') AND _status <> _row.status THEN
    RAISE EXCEPTION 'this agreement is already %; record a new one rather than reopening it', _row.status;
  END IF;
  -- One LIVE arrangement per client per offer. Without this the partial unique index answers with
  -- its own name, which is a database object in visible copy.
  IF _status IN ('active','paused') AND _row.status NOT IN ('active','paused')
     AND EXISTS (SELECT 1 FROM public.tenant_client_agreements other
                  WHERE other.tenant_id = _tenant
                    AND other.contact_id = _row.contact_id
                    AND other.offer_id = _row.offer_id
                    AND other.id <> _row.id
                    AND other.status IN ('active','paused')) THEN
    RAISE EXCEPTION 'this client already has a live arrangement for that offer; end that one first';
  END IF;
  _row := NULL;

  -- The same completeness rule the table carries, said in words BEFORE the constraint can fire.
  -- `cancelled` is exempt for the reason the CHECK is: cancelling is abandonment, and requiring a
  -- start date before someone may walk away made a half-finished draft uncancellable.
  IF _status NOT IN ('draft', 'cancelled') THEN
    SELECT * INTO _row FROM public.tenant_client_agreements
     WHERE id = _agreement_id AND tenant_id = _tenant;
    IF _row.id IS NULL THEN
      RAISE EXCEPTION 'that agreement is not in this workspace';
    END IF;
    IF _row.starts_on IS NULL THEN
      RAISE EXCEPTION 'give this a start date before making it %', _status;
    END IF;
    IF _row.price_basis = 'quote_pending' THEN
      RAISE EXCEPTION 'this is still awaiting its quote, so it cannot be made % yet', _status;
    END IF;
    _row := NULL;
  END IF;

  UPDATE public.tenant_client_agreements
     SET status = _status
   WHERE id = _agreement_id
     AND tenant_id = _tenant
     AND (_expected_updated_at IS NULL OR updated_at = _expected_updated_at)
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.tenant_client_agreements
                WHERE id = _agreement_id AND tenant_id = _tenant) THEN
      RAISE EXCEPTION 'someone else changed this agreement while you were editing it'
        USING ERRCODE = '40001';
    END IF;
    RAISE EXCEPTION 'that agreement is not in this workspace';
  END IF;

  RETURN to_jsonb(_row);
END;
$function$;

-- The EXECUTE grant is not the access control — the bodies above are (§59). anon is revoked
-- because what a business charges a named client is not a public fact, and neither function has a
-- token or slug path that would make it one.
REVOKE ALL ON FUNCTION public.save_client_agreement(uuid, uuid, uuid, uuid, text, text, uuid, bigint, text, text, integer, integer, text, date, date, date, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_agreement(uuid, uuid, uuid, uuid, text, text, uuid, bigint, text, text, integer, integer, text, date, date, date, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_client_agreement(uuid, uuid, uuid, uuid, text, text, uuid, bigint, text, text, integer, integer, text, date, date, date, text, text, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.set_client_agreement_status(uuid, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_client_agreement_status(uuid, uuid, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_client_agreement_status(uuid, uuid, text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.save_client_agreement(uuid, uuid, uuid, uuid, text, text, uuid, bigint, text, text, integer, integer, text, date, date, date, text, text, timestamptz) IS
  'Records the terms one client agreed to for one canonical Catalog offer. Reads the catalog '
  'price snapshot server-side off tenant_prices and NEVER writes to it. Creates no charge, '
  'invoice, provider subscription or external state.';

COMMENT ON FUNCTION public.set_client_agreement_status(uuid, uuid, text, timestamptz) IS
  'Moves an agreement between draft, active, paused, completed and cancelled. Records no payment '
  'or fulfilment status, because this table can observe neither.';
