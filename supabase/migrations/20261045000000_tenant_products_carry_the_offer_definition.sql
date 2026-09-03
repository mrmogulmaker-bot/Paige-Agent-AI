-- Offer Catalog Slice 2A — `tenant_products` becomes the tenant's canonical OFFER record.
--
-- VERSION NOTE. This was 20261044000000 until the Rail work landed
-- `20261044000000_rail_authority_is_decided_in_this_workspace.sql` on main with the SAME version.
-- Two migrations sharing a version is not a naming annoyance: the second one is SILENTLY SKIPPED.
-- Had this merged, none of the columns below would exist on prod, every tenant would have read
-- "not available on this deployment yet" forever, and nothing would have failed loudly enough for
-- anyone to notice. `lint:migration-versions` and the local `db reset` both caught it. Renumbered
-- to 20261045000000 rather than renumbering theirs, because theirs is already on main.
--
-- WHY THIS TABLE AND NOT A NEW ONE (§18, one home per capability). `tenant_products` already IS
-- the tenant's commercial record: it is read by the storefront (anon), the admin storefront panel,
-- the contact billing panel, the agency billing roll-up, `useTenantOffers` (which feeds the New
-- Deal and New Contact pickers), and both tenant commerce edge functions. Standing up a second
-- "offers" table would fork the definition the deal picker already reads, which is exactly the
-- §18 failure the Catalog slice exists to end. So the offer facts land ON the existing record.
--
-- WHAT THIS MIGRATION IS SAFE TO ASSUME, AND WHY IT IS NOT AN ASSUMPTION. Grounded against
-- production before writing (project xygzykjyynhzqytbqnzu):
--     tenant_products  0 rows        tenant_prices   0 rows
--     tenant_orders    0 rows        tenants with storefront_enabled  0
-- There is nothing to backfill, nothing to reinterpret, and no live consumer whose reading of an
-- existing row can change. Every column below is therefore ADDITIVE and NULLABLE with no default,
-- and no existing value is rewritten. A legacy row (there are none today, but a tenant may create
-- one through the existing Storefront panel before Slice 2B relocates it) simply carries NULL and
-- the surface renders an honest absence rather than inventing "Fixed amount" on its behalf (§13).
--
-- WHY NULLABLE RATHER THAN DEFAULTED. A default would make every unwritten row assert a fact
-- nobody stated. `price_presentation = 'fixed'` on a product with no price row is a lie the schema
-- tells on the tenant's behalf. NULL is the truthful shape for "not stated yet", and the read
-- surface is built to render it as such.
--
-- THE ONE CONSTRAINT THAT WIDENS: `status`. Verified live before editing —
--     tenant_products_status_check  CHECK (status = ANY (ARRAY['draft','active','archived']))
-- It gains 'paused', which the owner ruled is a first-class lifecycle state (a barber pausing a
-- service, a kit paused while a supplier changes) that no derivation can infer from the record.
-- Widening a CHECK is safe in both directions here: every existing value stays legal, and no
-- consumer breaks, because 'paused' cannot appear until something writes it.
--
-- WHAT 'paused' MEANS TO EVERY EXISTING CONSUMER — the §37 producer/consumer inventory, walked:
--   RLS `tp_public_active_read`   status = 'active'      -> a paused offer STOPS being publicly
--                                                           readable. Correct, and the point.
--   RLS `tpr_public_active_read`  parent status='active' -> its prices stop being public too.
--   TenantStorefront.tsx:60       status = 'active'      -> disappears from the public storefront.
--   ContactBillingPanel.tsx:117   status = 'active'      -> not offerable as a new subscription.
--   tenant-checkout-session       reads the product      -> unreachable anyway; see below.
--   useTenantOffers.ts:44         .neq('status','archived') -> a paused offer REMAINS selectable in
--                                 the New Deal / New Contact pickers. That is deliberate and left
--                                 unchanged by this slice: a deal already in flight for a paused
--                                 offer must still name it. Slice 2D owns the typed relationship
--                                 and will revisit the picker's filter with that context.
--   StorefrontPanel.tsx:137       reads all statuses     -> shows it; its editor offers only
--                                 draft/active, so it can display 'paused' but not set it. Slice 2B
--                                 relocates this editor into Catalog and closes that gap.
--   list_tenant_programs RPC      returns status verbatim -> passes 'paused' through untouched.
--
-- AND THE WRITER, which the first draft of this inventory missed and an adversarial review of the
-- pushed diff caught. `supabase/functions/tenant-product-upsert/index.ts:103,120` persists
-- `status: body.status ?? 'draft'` with NO allowlist, relying on this CHECK as its only validation.
-- Before this migration a caller posting 'paused' was rejected; after it, a tenant-admin JWT can
-- persist 'paused' through that function even though no UI offers it yet. That is legal and
-- harmless — 'paused' is now a real state and every reader above handles it — but it made
-- `StorefrontPanel`'s `status: "draft" | "active" | "archived"` union untrue, so that union is
-- widened in the same change. The edge function itself is NOT touched here: it deploys on merge,
-- and a read-only slice should not ship an edge deploy. Adding an explicit allowlist there is
-- recorded as a follow-up in the Gate B packet rather than smuggled into this slice.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO. It adds no inventory, no stock, no variants, no
-- cart, no line items, no tax, no shipping and no checkout. `price_presentation` records how a
-- price is SHOWN; it is not a billing contract and nothing here charges anybody. Tenant checkout
-- remains unreachable in production regardless of this migration (the storefront UI bypasses the
-- Connect gate while `tenant-checkout-session` still refuses with `tenant_payments_not_ready`),
-- and PAIGE is not the merchant of record for a tenant selling to their own customer (§38).
-- Product operations and orders are Commerce Slices 3A and 3B, each with its own approval.

alter table public.tenant_products
  add column if not exists offer_kind         text,
  add column if not exists summary            text,
  add column if not exists delivery_shape     text,
  add column if not exists price_presentation text,
  add column if not exists customer_action    text,
  add column if not exists category           text;

comment on column public.tenant_products.offer_kind is
  'Product or Service — the COMMERCIAL kind. Deliberately NOT derived from product_type, which is '
  'billing cadence: its only writer (tenant-product-upsert) sets one_time/recurring from whether a '
  'recurring plan exists and never writes ''service'', so deriving from it labels every coaching '
  'retainer a Product. Nullable until the tenant states it.';
comment on column public.tenant_products.summary is
  'One customer-facing sentence. The fuller prose stays in `description`.';
comment on column public.tenant_products.delivery_shape is
  'How the offer reaches the customer. Nullable: a tenant need not classify it.';
comment on column public.tenant_products.price_presentation is
  'How the price is DISPLAYED, not a billing contract. Nullable = not stated.';
comment on column public.tenant_products.customer_action is
  'What the customer is invited to do. Nullable = not stated.';
comment on column public.tenant_products.category is
  'Tenant-authored grouping. Free text on purpose — these are the tenant''s words, not ours.';

-- `status` widens to carry 'paused'. Dropped and re-added rather than altered, because Postgres
-- has no ALTER CONSTRAINT for a CHECK predicate. Both statements are idempotent.
alter table public.tenant_products
  drop constraint if exists tenant_products_status_check;
alter table public.tenant_products
  add constraint tenant_products_status_check
  check (status in ('draft', 'active', 'paused', 'archived'));

-- The three new classified fields are constrained but nullable, so "not stated" stays expressible.
-- `category` is deliberately unconstrained: it is the tenant's own vocabulary (§9 tenant-authored).
alter table public.tenant_products
  drop constraint if exists tenant_products_offer_kind_check;
alter table public.tenant_products
  add constraint tenant_products_offer_kind_check
  check (offer_kind is null or offer_kind in ('product', 'service'));

alter table public.tenant_products
  drop constraint if exists tenant_products_delivery_shape_check;
alter table public.tenant_products
  add constraint tenant_products_delivery_shape_check
  check (delivery_shape is null or delivery_shape in
    ('digital', 'physical', 'appointment', 'program', 'membership', 'hybrid'));

alter table public.tenant_products
  drop constraint if exists tenant_products_price_presentation_check;
alter table public.tenant_products
  add constraint tenant_products_price_presentation_check
  check (price_presentation is null or price_presentation in
    ('fixed', 'from', 'contact', 'none'));

alter table public.tenant_products
  drop constraint if exists tenant_products_customer_action_check;
alter table public.tenant_products
  add constraint tenant_products_customer_action_check
  check (customer_action is null or customer_action in
    ('buy', 'book', 'apply', 'enquire', 'learn'));

-- The Catalog list orders by status then name within one tenant. The existing
-- idx_tenant_products_status is (tenant_id, status), which already serves that prefix; no new
-- index is added, because an unused index is a write cost with no reader.
