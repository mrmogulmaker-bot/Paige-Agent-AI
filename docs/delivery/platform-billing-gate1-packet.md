# Platform Billing — Gate 1 decision packet (Phase 1, read-only)

**Status: GATE 1 PENDING — nothing in this packet is built, wired, or live.** This is the revised
Phase 1 packet for the Platform Billing assignment, refined under the owner's binding product
clarification of 2026-09-02. It preserves every Phase 1 requirement of the original assignment:
read-only, Fable-led audit, a throwaway prototype, a security read, and Gate 1 approval before
any implementation. **No Stripe Product, Price, Coupon, Customer, Subscription, meter, charge,
provider connection, migration, or code path was created or modified.** Every claim below is
cited to a file on `main` at `1fb7928` or marked `UNVERIFIED`.

**Companions, all in this PR:**

| Artifact | Path | Purpose |
|---|---|---|
| Gate 1 prototype | `docs/prototypes/platform-billing-gate1.html` | Throwaway, read-only review surface carrying every required state |
| Surface card | `docs/doctrine/surface-cards/billing.md` | Billing as it is today — truth label `PARTIAL` |
| Marketplace handoff | `docs/handoff/platform-billing-marketplace-addon-handoff.md` | Durable contract to the Marketplace owner; no Marketplace code changes here |

---

## 0. The pre-edit frame (§69)

| Field | Value |
|---|---|
| Mode | Existing Project · Security/Audit · Flow Prototype (Phase 1, no code) |
| Depth | Deep — R3 (payments, permissions), independent review |
| Paradigm | `web` |
| Head | local `1fb7928` = `origin/main` = `origin/claude/platform-billing-clarification-l6zqr5`; clean tree |
| Changed-file boundary | docs only: this packet · the surface card · the prototype · the Marketplace handoff · `docs/brain/decision-log.md` · `docs/brain/README.md` · `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §5. **No `src/`, no `supabase/`.** |
| Ownership / collisions | Metering (MET1/MET2, parked issue #737) — read, not touched. Marketplace entitlement floor (`src/solo/marketplace.tsx:79`) — handoff, not touched. Chat approval gate (`docs/doctrine/one-approval-gate.md`) — billing decisions will build TO it, never beside it. |
| Regression impact map | Zero runtime change. No test, route, RPC, policy, or job is altered. CI path filters on `supabase/**` and `src/**` will not fire; the `verify` job runs on docs and is expected green. |
| Failing-first plan | N/A for a no-code phase. The prototype carries a structural self-check (every required state id present and reachable) run before commit; see §11. |
| Gates | **Gate 1 is this phase's exit.** Gate 2 is not requested. Gate 5 (skill pairing) — both `flow-by-flow` and `flow-prototype` present at version 2.0.1: PASS. |

---

## 1. Two billing domains, kept completely separate

```
┌────────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
│  PLATFORM BILLING  (this workstream)       │   │  CLIENT BILLING  (not this workstream)    │
│  Who pays whom: Solo WORKSPACE → PAIGE     │   │  Who pays whom: Solo's CUSTOMER → Solo    │
│  Home: Settings → Billing                  │   │  Home: Sales / future client finance      │
│  Operator config: platform operator        │   │  Source: Offer Catalog (tenant products)  │
│                                            │   │                                           │
│  base Solo subscription                    │   │  invoices · quotes · payments             │
│  included allowances                       │   │  client balances · Sales workflows        │
│  verified usage charges (if approved)      │   │                                           │
│  telephony platform charges (if approved)  │   │  Money leg: tenant's OWN processor        │
│  paid Marketplace add-ons                  │   │  (§38 — Paige is never merchant of record │
│  invoices · payment methods · status ·     │   │   for a tenant→client transaction)        │
│  credits · entitlement                     │   │                                           │
│                                            │   │  Tables (§197 LAYER 2): tenant_products,  │
│  Tables (§197 LAYER 1): platform_          │   │  tenant_prices, tenant_orders,            │
│  subscription_plans, platform_             │   │  tenant_service_subscriptions             │
│  subscriptions, platform_invoices,         │   │                                           │
│  platform_usage_events; Marketplace: marketplace_items / _installs / _install_ledger      │
│  Stripe account: PAIGE platform            │   │  Stripe account: tenant Connect / BYO     │
└────────────────────────────────────────────┘   └──────────────────────────────────────────┘
          ▲ never a foreign key across this line (§197 rule 2) ▲
```

**Rules this packet binds itself to:**

- The billing account is the **workspace's** relationship with the platform, never a staff
  member's personal account. (Audit finding A1 below shows the shipped portal function breaks
  this today.)
- Settings → Billing never models, migrates, or implies client invoicing. The prototype carries an
  explicit "client invoices belong in Sales" hand-off state and nothing else about client money.
- Platform Stripe objects (Customer/Subscription/Invoice on Paige's account) are never mixed with
  a tenant's future customer-invoice system.

---

## 2. What exists today — the read-only audit

Verified on `main` `1fb7928`. **Runtime behaviour was not driven** (no browser, no operator JWT
in this session); every row is static/code evidence unless marked otherwise.

### 2.1 Solo Settings → Billing (the human surface)

| Item | State | Evidence |
|---|---|---|
| Tab exists in the canonical Solo shell, eighth of eight | LIVE (structure) | `src/solo/settings.tsx:1464`, `settings-contract.ts:102` label `PARTIAL` |
| "Platform subscription" card: Plan · Status · Price · Renewal | PARTIAL, read-only | `settings.tsx:1457-1459`; reads `platform_subscription_plans`, `get_tenant_platform_subscription()`, `is_current_user_tenant_admin()` via `useSoloComms.ts:259-270` |
| "Invoices & payment method" card | UNAVAILABLE (honest static copy) | `settings.tsx:1459` — "No proven frontend read supports invoices or payment methods here." |
| "Usage & limits" card | UNAVAILABLE (honest static copy) | same line — "No totals are shown." |
| Any write or action (manage plan, portal, cancel, change) | none on the Solo surface | `settings.tsx` BillingView has no button; the legacy Setup tab's "Manage plan" is `disabled` (`src/solo/setup.tsx:589`) |
| Sub-account behaviour | **UI-REPAIR** (known, parity matrix) | `useSoloComms.ts:333` skips the plan read for a sub-account by design (billing is the parent's, §60) but `BillingView` never reads `isSubAccount`, so it says "No current Solo subscription record was returned" — a false statement of "no plan". `docs/doctrine/canonical-solo-parity-matrix.md:178` |
| Billing-role gate | exists, read-only | `is_current_user_tenant_admin()` (migration `20260726120000`) returns `canManage`; nothing on the surface consumes it yet except the disabled legacy button |

### 2.2 Platform subscription substrate (LAYER 1)

| Item | State | Evidence |
|---|---|---|
| Plan rows | two self-serve + one custom | `solo` $149/mo · $1,490/yr (3 seats, 250 contacts) · `agency` $397/mo · `enterprise` $0 custom — seeded `20260702035703`, renamed `20260726140000` |
| Registered Stripe price | monthly only on `solo`/`agency` | `platform-subscription-checkout/index.ts` PRICE block comment: `stripe_price_id` is the MONTHLY price object; annual uses inline `price_data` |
| Beta price $74.50 | **does not exist anywhere** | grep `7450`, `74.50`, `beta` across `supabase/`, `src/`, `docs/strategy` — only the 2026-07-21 rollout doc's "Practice $75/mo Wave 1/2 lifetime" (line 239), a different mechanism (founding-wave grandfather) at a different figure |
| Public price shown | $149 / $397 / Custom | `src/components/landing/PricingSection.tsx:37,54,72` |
| CREATE leg | edge fn, JWT-gated, pre-charge parity gates | `platform-subscription-checkout` (510 lines): tenant admin required on grandfathered path, 409 on double-subscribe, never a $0 recurring session |
| Sole WRITER of `platform_subscriptions` | Stripe webhook, service role, signed metadata discriminant | `stripe-webhook/index.ts:681-760` (checkout), `:1298-1345` (`customer.subscription.updated` syncs `status` + `cancel_at_period_end`), `:1408-1430` (deleted → canceled) |
| READ seam (Paige-callable §10) | exists | `get_tenant_platform_subscription()` — tenant derived server-side, `security definer` pinned to caller's tenant |
| RLS | tenant reads own; only platform owner writes | migration `20260702005950:58-59, 85-86, 104-105` |
| Live paid tenants | **0** (recorded 2026-08-09) | master doc: `promotional 8 / internal_test 1 / paid 0`; the 3 `active` rows are comped with NULL `stripe_subscription_id` |

### 2.3 Invoices and payment method

| Item | State | Evidence |
|---|---|---|
| `platform_invoices` table | exists, **zero writers** | only reference in the repo is its creating migration `20260702005950`; the webhook's `invoice.paid` / `invoice.payment_failed` arms never touch it |
| Stripe-hosted customer portal | edge fn exists, **wrong key, no Solo caller** | `customer-portal/index.ts:43` resolves the Stripe customer by `stripe.customers.list({ email: user.email })` — the person, not the workspace; `return_url` is `/dashboard`, not a Solo route; legacy `STRIPE_SECRET_KEY` only. No `src/solo` caller. |
| `check-subscription` | same email-keyed pattern | `check-subscription/index.ts:58-59` |

### 2.4 Usage, allowance, and meters

| Item | State | Evidence |
|---|---|---|
| Usage ledger | exists, tenant-scoped, idempotent for LLM tokens | `platform_usage_events` (`tenant_id, event_type, quantity, unit, occurred_at, metadata, reconciled_invoice_id`); unique on `metadata->>'trace_id'` for `llm_tokens` (`20261033000000`) |
| What is metered today | `llm_tokens` (from `paige_llm_trace`, hourly drain `meter-llm-usage-hourly`), `tts_char`, `tenant_provisioned` | `20261033000000`, `20261038000000` |
| Cost on those rows | **estimate in metadata, never a billing column; null on most historical rows** | same migration header, §13 |
| Whether the drain runs on prod | **UNVERIFIED** in this session | parked issue #737 (master doc contradiction), MET2 evidence owed |
| Allowance model (included units, thresholds, warnings) | **does not exist** | `platform_subscription_plans.metered_addons` carries only `credit_pulls_per_month` / `sms_included` / `white_label` JSON; no column, RPC, or job knows an allowance, a threshold, or a warning |
| Tenant-facing usage read | none | tier matrix §MET1 ledger: "No consumer surface exists yet, and none is claimed" |
| Stripe metered subscription item | none | no `subscription_items` / `meter_events` call anywhere in `supabase/functions` |
| Telephony (phone number) charge | Twilio buy is wired; **the CHARGE leg is not** | `comms-purchase-number/index.ts:25-29` — response carries `charge_wired: false`; `platform_number_pricing` holds wholesale + retail |

### 2.5 Marketplace paid add-ons

| Item | State | Evidence |
|---|---|---|
| Item pricing fields | exist | `marketplace_items.price_cents`, `pricing_model`, `billing_period`, `take_rate_bps`, `available_to_tiers` |
| Paid purchase leg | one-time only (`mode: "payment"`), JWT-gated, pre-charge parity gates | `marketplace-checkout-session/index.ts:286` and header; webhook `checkout.session.completed` arm keyed on `marketplace_item_slug` then calls install |
| Recurring add-on subscription | **none** | Money Spine B-v "scoped, not started" (`docs/doctrine/money-spine-architecture.md`) |
| Entitlement record | `marketplace_installs` (status active/uninstalled) + append-only `marketplace_install_ledger` | migration `20260714280000` |
| Solo Marketplace UI | entitlement actions **deliberately UNAVAILABLE** ("Installation, removal, updates, purchase, and activation wait for immutable release authority…") | `src/solo/marketplace.tsx:79` |
| All current items | first-party, price 0 | `marketplace-checkout-session` header: "the only vendor today is first-party 'paige'" |

### 2.6 Operator configuration surfaces

| Item | State | Evidence |
|---|---|---|
| Operator Revenue → Plans / Metering / Invoices | **spec shells with null values**; tier names ship, prices/credits/rates deliberately do not | `src/operator/surfaces/specs/moneySpecs.ts:164-280` (`value: null` on every stat) |
| Operator upsert seam for plans | none for `platform_subscription_plans` (rows exist only via migration) | grep `platform_subscription_plans` in `supabase/functions` — read-only in checkout |
| Operator upsert seam for Marketplace items | exists | `upsert_marketplace_item` (`20260714192625`, `20260714340000`) with `price_cents >= 0` check |

---

## 3. Audit findings (ranked; nothing fixed in Phase 1)

| # | Severity | Finding | Evidence | Phase it belongs to |
|---|---|---|---|---|
| **A1** | **HIGH (§9 / boundary)** | The Stripe-hosted portal and subscription check resolve the Stripe Customer by the **signed-in person's email**, not by the workspace's `platform_subscriptions.stripe_customer_id`. A person in two workspaces, or an owner who used a personal email for a legacy L2 purchase, lands in the wrong customer. There is also no tenant-admin gate on the portal. | `customer-portal/index.ts:43-47`, `check-subscription/index.ts:58-59` | Billing Foundation (mapping) — must be fixed before any Solo "Manage billing" button exists |
| **A2** | **HIGH (§38 / entitlement)** | `install_marketplace_item` (4-arg overload, `GRANT EXECUTE … TO authenticated`) installs **any listed item regardless of `price_cents`** and writes a ledger row with `gross_cents = price_cents` that was never collected. The payment-first path exists only because the UI and checkout call it *that way*; nothing structural stops a tenant admin from calling `marketplace-install` (or the RPC from Chat, §10) on a paid item. Today all items are price 0, so no money is lost yet — but this is exactly "Install silently becomes Charge/entitlement". | `20260714280000_marketplace_install_seam.sql:148-155` ledger insert; header of `marketplace-checkout-session` ("install is payment-AGNOSTIC") | Marketplace add-ons — handed off, see `docs/handoff/platform-billing-marketplace-addon-handoff.md` |
| **A3** | MEDIUM (§197 cross-layer) | The webhook's `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created` and `charge.refunded` arms are **not discriminated on `platform_plan_slug`**: a paid platform invoice would upsert an L2 `tier_state` row for the owner's email with tier "standard", and a failed platform payment updates `user_subscriptions`, never `platform_subscriptions` (status still arrives via `customer.subscription.updated`). | `stripe-webhook/index.ts:1557-1650` | Billing Foundation (verified webhooks) |
| **A4** | MEDIUM (§13 truth) | Sub-account Billing states "no subscription record was returned" when the read was skipped on purpose. | `useSoloComms.ts:333`, `settings.tsx:1459` | Beta Base Plan + truthful screen (the "billed by your agency" state) |
| **A5** | MEDIUM (§2) | The platform-default `solo` plan's `metered_addons` JSON carries `credit_pulls_per_month` — a finance-vertical unit seeded into a platform default. | `20260702035703:99-103` | Billing Foundation (operator configuration audit) — owner decision on whether the field is renamed, emptied, or made a Playbook opt-in |
| **A6** | LOW | `platform_invoices` has no writer, so any "Invoices" list from our tables would be empty and misleading; only the Stripe-hosted portal can show invoices truthfully today. | grep | Beta Base Plan (portal entry) |
| **A7** | LOW | No annual Stripe Price is registered; annual checkout uses inline `price_data`. Any beta Price decision must state monthly/annual explicitly. | checkout PRICE block | Beta policy decision |
| **A8** | INFO | Telephony purchase records the retail price and explicitly reports `charge_wired: false`. Honest today; becomes a meter only under sequence step 5. | `comms-purchase-number/index.ts:25-29` | Additional meters |

---

## 4. Beta commercial direction — modelled, not decided

**Approved product direction for the prototype only** (owner, 2026-09-02): reference plan
$149/month; intended beta base $74.50/month; a defined included allowance for selected
AI/autonomy/chat/platform usage; real observed usage and cost evidence required before any
automatic overage. **This authorizes a prototype state. It does not authorize a Stripe Product,
Price, Coupon, Customer, Subscription, or a plan-row change.**

### 4.1 Decisions the owner must settle (do not invent — each carries a recommendation and its consequence)

| # | Decision | Options seen in the evidence | Recommendation (reversible `ASSUMED` until ruled) | If chosen differently |
|---|---|---|---|---|
| D1 | **Beta eligibility** | (a) every new Solo workspace during the beta window · (b) invite/list only · (c) tier-gated (Solo only, never Agency/Enterprise) | (a)+(c): every Solo workspace that provisions inside the window; Agency/Enterprise excluded | (b) needs an allow-list seam that does not exist |
| D2 | **Start / end / grandfathering** | fixed calendar window · N-workspace cap · lifetime lock at signup tier (the 2026-07-21 rollout doc's founding-wave pattern) | fixed window + lifetime lock for those who joined in it, matching the rollout doc's bounded-cohort principle | a rolling "until we say so" beta has no end state for the screen to show |
| D3 | **Stripe mechanism** | (i) a separate Stripe Price on the same Product · (ii) a time-bounded Coupon/promotion on the $149 Price · (iii) a separate Product | (i) separate Price `solo-beta` on the existing Solo Product: the plan row can carry it, the webhook's `platform_plan_slug` discriminant still works, and the after-beta transition is a Price swap, not a coupon expiry the UI cannot see | (ii) makes "what plan am I on after beta" invisible to our tables (coupons are not on `platform_subscriptions`) |
| D4 | **State after beta ends** | auto-move to $149 with notice · stay at $74.50 for life (grandfather) · pause and ask | grandfather for in-window joiners (per D2); new joiners after the window pay $149 | auto-move needs a scheduled Price swap + notice job — none exists |
| D5 | **Exact included allowances** | units must come from what is measured: `llm_tokens` today; `tts_char`; nothing else is metered | define the beta allowance in **AI usage units the meter actually records** (tokens, or a credit that maps to tokens with a published ratio); publish the ratio | any "chat messages" or "actions" unit has no source event today and would be an estimate — never billable |
| D6 | **Warning and limit behaviour** | warn at 75% / 90% / 100% · warn only · hard stop | warn at 75% and 90%; at 100% keep the workspace usable and show "included allowance used"; no stop during beta | a hard stop needs an enforcement point at the action bus (see §7) which is not built |
| D7 | **After allowance is exhausted** | usable · limited (Paige drafts but does not act) · paused | usable during beta, evidence-gathering only | limited/paused needs the Trust Compass ↔ quota gate (§7) |
| D8 | **Overage** | automatic · opt-in · unavailable during beta | **unavailable during beta** — the owner's own condition ("real observed usage and cost evidence before automatic overage charges") | automatic overage needs a Stripe metered item, reconciliation, and an owner-approved rate; none exists |

Every D-row renders as a prototype state so the owner can see the consequence before ruling.

---

## 5. Recommended MVP billing sequence (refined)

Each step is its own slice with its own Gate 1/Gate 2, own crew, own §32 proof. Nothing here is
started.

| # | Slice | What it delivers | Depends on | Owner decisions needed first |
|---|---|---|---|---|
| 1 | **Billing Foundation** | Workspace ↔ billing-account mapping (portal/subscription lookups keyed on `platform_subscriptions.stripe_customer_id`, tenant-admin gated — fixes A1); webhook arms discriminated on `platform_plan_slug` for invoice/refund events (A3); `platform_invoices` gets its sole writer (the webhook) or is declared not-a-source; entitlement projection = one read seam that says plan · status · renewal · included allowance · add-ons; operator configuration audit (A5) | nothing | A5 disposition |
| 2 | **Beta Base Plan + truthful Billing screen** | Plan/status/renewal from the projection; sub-account "billed by your agency" state (A4); Stripe-hosted portal entry via the fixed mapping; the $74.50 state rendered **only after** D1–D4 are ruled and the Price exists | 1 | D1–D4 |
| 3 | **Included-usage visibility** | One server-owned usage read (from `platform_usage_events`, tenant-scoped) with allowance and 75/90/100% warnings; **no automatic overage**; MET2 evidence that the drain runs on prod is a precondition | 1, 2, MET2 | D5–D8 |
| 4 | **Marketplace paid add-ons** | One explicit purchase → verified payment → entitlement flow, after the Marketplace contract and operator price configuration are approved; A2 closed structurally (a paid item cannot install without a verified payment event) | 1, Marketplace handoff accepted | Marketplace owner + operator price config |
| 5 | **Additional meters, one at a time** | Phone number · telephony minutes/messages · active app usage · AI/autonomy/chat · seats · other — each independently verified against the meter contract in §6 | 3 | per-meter approval |

---

## 6. The meter contract (binds every metered dimension, forever)

A dimension is billable only when all eight fields are filled and verified. A blank field is an
`UNAVAILABLE` state on the screen, never an estimate.

| Field | Meaning | Example for the one meter that exists (`llm_tokens`) |
|---|---|---|
| Exact unit | the measured quantity | tokens (input + output), integer |
| Server-authoritative source event | the row that proves it happened | `paige_llm_trace` → `platform_usage_events` via `meter_llm_usage()` |
| Idempotency rule | how a replay cannot double-bill | unique `(metadata->>'trace_id')` where `event_type='llm_tokens'` |
| Reconciliation method | how our sum is checked against the provider and the invoice | **missing** — no Stripe meter, no `reconciled_invoice_id` writer |
| Entitlement relationship | which allowance it draws down | **missing** — no allowance model |
| Customer-facing explanation | the one sentence a Solo owner reads | **missing** |
| Truthful unavailable state | what the screen says when any field above is blank | "Usage is recorded but not yet counted against a plan" |
| Never-billable inputs | what may never become a charge | browser activity · estimates · model-generated values · `cost_estimate_usd` in metadata |

---

## 7. Where enforcement must live (recorded so it is not re-derived)

The design pack's backend note already places the quota check **at the action bus, beside the
autonomy lane** (`docs/design-references/cd-packs/super-admin-shell/billing-backend-notes.md`,
"Entitlement enforcement belongs in the product, not the invoice"). §67/§68 give the arithmetic:
`effective = min(grant, floor, ceiling)`; a quota is one more clamp in that same place. Any
"limited" or "paused" answer to D7 is built there, never in the Billing screen. This is a
**Spine Change Request** when it comes, not a Billing slice.

---

## 8. Marketplace is a Platform Billing consumer

A paid Marketplace tool may create a platform billing line item only after, in order:

1. the platform operator defines the product, price, cadence, entitlement, and cancellation policy
   (`upsert_marketplace_item` exists; cadence/cancellation fields for a recurring item do not);
2. the Solo workspace sees the price and the billing effect before enabling it;
3. an authorized billing decision occurs (tenant admin, through the one approval gate);
4. verified Stripe/platform billing state confirms payment or the approved entitlement condition
   (webhook `checkout.session.completed` keyed on `marketplace_item_slug` — the only truthful
   signal today);
5. the platform grants/revokes entitlement **from that verified state** (closes A2).

The prototype models add-ons as a distinct section inside Billing: available vs installed · price
and cadence · included-in-plan · pending / failed payment · active entitlement · scheduled
cancellation · unavailable/not-yet-billable. The durable handoff to the Marketplace owner is
`docs/handoff/platform-billing-marketplace-addon-handoff.md`. **No Marketplace code or
entitlement logic changes in Phase 1.**

---

## 9. Flow map (actor → goal), with the current truth per flow

| Flow | Actor | Goal | Today | Prototype state(s) |
|---|---|---|---|---|
| F1 | Solo owner/admin | See what my workspace pays the platform and when it renews | PARTIAL read | `plan-current`, `plan-beta`, `plan-none`, `plan-loading`, `plan-error` |
| F2 | Solo owner/admin | Update card / download invoices | UNAVAILABLE (A1, A6) | `portal-entry`, `portal-unavailable` |
| F3 | Solo owner/admin | See included allowance and how much is used | UNAVAILABLE | `usage-included`, `usage-warn-75`, `usage-warn-90`, `usage-exhausted`, `usage-no-meter` |
| F4 | Solo owner/admin | Enable a paid add-on and understand the charge | UNAVAILABLE by design | `addon-available`, `addon-selected`, `addon-pending`, `addon-active`, `addon-declined`, `addon-failed`, `addon-cancel-scheduled`, `addon-not-billable`, `addon-included` |
| F5 | Solo member (not admin) | Understand why I cannot manage billing | not handled | `role-refusal` |
| F6 | Owner of several workspaces | Switch account and see the right billing | not handled (A1) | `account-switch` |
| F7 | Sub-account owner | Learn billing is the agency's | misreported (A4) | `plan-subaccount` |
| F8 | Solo owner | Find client invoices | no pointer | `client-billing-boundary` |
| F9 | Platform operator | Configure plan / beta price / add-on price and policy | spec shells | `operator-plan-config`, `operator-addon-config` |

---

## 10. Security read (Phase 1, static)

- **Tenant isolation:** every LAYER 1 table is RLS-gated to `current_user_tenant_id()` or platform
  owner; the read seam pins to the caller's tenant; the checkout functions derive tenant from the
  session and honour a body `tenant_id` only for a platform owner. **Sound.**
- **The one hole is A1** — an email-keyed customer lookup is not a tenant-scoped read. It must not be
  called from the Solo surface until it is re-keyed and admin-gated.
- **A2** is an entitlement hole, not a money hole today (all items price 0) — handed off.
- **Approval:** a billing decision (subscribe, add-on purchase, cancel) is a `high` act and builds
  to the one approval gate (`docs/doctrine/one-approval-gate.md`); Phase 1 proposes no new proof of
  approval.
- **Secrets:** none read, none written; names only (`STRIPE_SECRET_KEY`, `_V2`, webhook secrets).
- **§50 / §63 / §2 sweep on this PR:** no pop-culture marks; no owner real-account named as an
  example (the prototype uses "Harbor & Vine" from the design pack and a placeholder workspace);
  no finance/credit language in any default copy (A5 is *reported*, not introduced).

---

## 11. Evidence, separated by class (§13 / §70.1)

| Class | This packet |
|---|---|
| Automated tests | none run — no code changed |
| Static / build | docs only; `verify` CI expected green; prototype validated as well-formed HTML with all 27 required state ids present (self-check run before commit, transcript in the PR body) |
| Structural / harness render | the prototype is a browser simulation with deterministic local state and **no network, no mutation, no Stripe** |
| Authenticated runtime on the real platform | **not driven** — no browser/JWT capability in this session; the current Billing tab's rendered behaviour is inferred from source only |
| UNVERIFIED | whether `meter-llm-usage-hourly` runs on prod (#737); whether `solo.stripe_price_id` still resolves live; the exact Stripe account (legacy vs V2) the platform subscription rail uses in production |

---

## 12. The Gate 1 question

Open `docs/prototypes/platform-billing-gate1.html`, walk the state controls, and rule on:

1. the Platform ↔ Client boundary as drawn (§1);
2. the Settings → Billing shape: subscription · portal entry · included usage · add-ons · boundary
   pointer, in that order;
3. D1–D8 (§4.1) — each with its recommendation, or a different answer;
4. the sequence in §5 and whether Billing Foundation (step 1) may be briefed as the next slice.

**Gate 1 approval authorizes drafting the Billing Foundation brief. It does not authorize a Stripe
object, a meter, a charge, a provider connection, or any billing implementation** — each of those
sits behind its own Gate 2 with an exact head.
