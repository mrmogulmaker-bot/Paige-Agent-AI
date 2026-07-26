# B-iv §38 Connect-posture diagnostic (spike — no code landed)

**Date:** 2026-07-26 · **Type:** diagnostic spike (parallel to B-ii) · **Outcome:** §38 VIOLATION found → B-iv-fix filed, NOT deployed (storefront plane dormant until #458).

## §38 requirement
Stripe Connect **DIRECT-charge** on the tenant-connected account: the **tenant is merchant of record**, funds settle **directly** on the tenant's connected account, Paige takes an `application_fee` and **never holds tenant funds**.

## What was inspected (on `main`, a527222)
1. **Producer — `supabase/functions/tenant-checkout-session/index.ts`** (undeployed; dormant plane).
2. **Consumer — shipped `stripe-webhook` storefront branch** (live; the B-iv completion arm).

## Finding: DESTINATION-charge (VIOLATION)
`tenant-checkout-session` builds a **destination charge on the PLATFORM account**:
- `index.ts:1` — comment: *"…using a destination…"*
- `:114-117` (payment mode) — `payment_intent_data = { application_fee_amount, transfer_data: { destination: connect.stripe_account_id } }`
- `:119-122` (subscription mode) — `subscription_data = { application_fee_percent, transfer_data: { destination: connect.stripe_account_id } }`
- `:125` — `stripe.checkout.sessions.create(params)` — created on the **platform** account (no `stripeAccount` option).

→ Paige is merchant of record; funds hit the platform account and auto-transfer to the tenant. **This is the pattern §38 prohibits.**

**Consumer is §38-neutral (no fix needed):** the shipped webhook storefront branch only does
`UPDATE tenant_orders SET status='complete', stripe_payment_intent_id=session.payment_intent WHERE stripe_session_id=session.id AND status='pending'` — keyed on Stripe-signed `metadata.tenant_price_id` + `session.id`. It works identically for direct or destination charges. The one **activation-time** requirement it inherits under direct-charge: the platform webhook endpoint must be **subscribed to connected-account events** (`checkout.session.completed` fires on the *connected* account for a direct charge; delivered to the platform endpoint with `event.account` set, still signed by the same endpoint secret so `constructEvent` verifies). This is a Stripe Dashboard/endpoint config, folded into #458 activation — **not** a code change.

## B-iv-fix — minimal direct-charge diff (tenant-checkout-session ONLY; do NOT deploy)
```diff
-// Create a Stripe Checkout Session for a tenant's product using a destination
-// charge (funds settle on the tenant's connected account, platform takes a fee).
+// Create a Stripe Checkout Session for a tenant's product using a DIRECT charge
+// on the tenant's connected account (§38: tenant is merchant of record; the
+// platform takes an application_fee and never holds tenant funds).
@@ payment mode @@
   if (mode === "payment") {
     params.payment_intent_data = {
       application_fee_amount: applicationFee || undefined,
-      transfer_data: { destination: connect.stripe_account_id },
     };
   } else {
     params.subscription_data = {
       application_fee_percent: feeBps > 0 ? feeBps / 100 : undefined,
-      transfer_data: { destination: connect.stripe_account_id },
     };
   }
@@ session create @@
-  const session = await stripe.checkout.sessions.create(params);
+  // §38 direct charge: create the session ON the tenant's connected account.
+  const session = await stripe.checkout.sessions.create(params, {
+    stripeAccount: connect.stripe_account_id,
+  });
```
**Why this is the whole fix:** on a direct charge the money is *already* on the connected account, so `transfer_data.destination` (which moves platform-account funds outward) must be removed; the `application_fee_*` stays and now represents the platform's cut of a charge that belongs to the tenant. Creating the session with `{ stripeAccount }` is what places the charge on the tenant's account. No other line changes.

## Cross-reference for B-ii (the in-flight marketplace paid-install leg)
B-ii's new `marketplace-checkout-session` is a **different** economic model on purpose: a *marketplace vendor* payout, where the platform (or the first-party `paige` vendor) is legitimately the seller. The §38 "tenant is merchant of record" rule is about a **tenant selling to their own customer** (the storefront), not about a tenant buying a platform add-on. B-ii's first-party case correctly keeps 100% on the platform (no transfer); a third-party vendor case is a *destination/transfer to the vendor* — that is vendor-payout economics (Lane B-iii), distinct from §38's storefront merchant-of-record rule. **No §38 conflict with B-ii.**

## Disposition
- **No code landed** (diagnostic spike). The diff above is filed as **B-iv-fix** (task) and folded into **#458** activation — apply + deploy only when the storefront plane is activated, together with the connected-account webhook subscription.
