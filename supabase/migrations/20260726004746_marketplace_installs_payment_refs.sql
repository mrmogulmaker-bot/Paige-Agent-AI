-- LANE B-ii-a — Marketplace paid-install payment references
-- Additive only: two nullable text columns on marketplace_installs so the
-- stripe-webhook completion arm can stamp the Stripe checkout/session +
-- payment-intent onto a paid install. No backfill (0 rows today; all prior
-- installs would be free anyway). No RPC signature change — install_marketplace_item
-- stays payment-agnostic; the webhook stamps these columns AFTER the RPC writes
-- the install + ledger. service_subscription_id intentionally stays NULL: a
-- one-time 'payment' checkout has no subscription (§13 — do not fabricate).

ALTER TABLE public.marketplace_installs
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMENT ON COLUMN public.marketplace_installs.stripe_payment_intent_id IS
  'Stripe PaymentIntent id for a PAID install (Stripe mode=payment, one-time). NULL for free installs. Set by stripe-webhook on checkout.session.completed via the Stripe-signed marketplace_item_slug metadata branch. One-time payment has no subscription, so service_subscription_id stays NULL. — LANE B-ii-a';

COMMENT ON COLUMN public.marketplace_installs.stripe_checkout_session_id IS
  'Stripe Checkout Session id (cs_...) for a paid install; NULL for free installs. Set by stripe-webhook alongside stripe_payment_intent_id. — LANE B-ii-a';
