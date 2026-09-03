# Platform Billing — Gate 1 decision packet (Phase 1, read-only)

**Status: GATE 1 APPROVED (owner, 2026-09-02) — see §4.2 for the rulings mapped onto D1–D8. Still nothing in this packet is built, wired, or live; Gate B for this PR asks to merge the documentation and prototype record only.** This is the revised
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
| Head | audit base `origin/main` `1fb7928`; the packet's own commits sit on `claude/platform-billing-clarification-l6zqr5` above it; clean tree |
| Changed-file boundary | docs only: this packet · the surface card · the prototype · the Marketplace handoff · `docs/brain/decision-log.md` · `docs/brain/README.md` · `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §5. **No `src/`, no `supabase/`.** |
| Ownership / collisions | Metering (MET1/MET2, parked issue #737) — read, not touched. Marketplace entitlement floor (`src/solo/marketplace.tsx:79`) — handoff, not touched. Chat approval gate (`docs/doctrine/one-approval-gate.md`) — billing decisions will build TO it, never beside it. |
| Regression impact map | Zero runtime change. No test, route, RPC, policy, or job is altered. The `verify` and `audit` jobs run on every PR and are expected green on a docs-only diff; the Supabase preview and deploy workflows are the path-filtered ones and will skip. |
| Failing-first plan | N/A for a no-code phase. The prototype carries a structural self-check (every required state id present and reachable) run before commit; see §11. |
| Gates | **Gate 1 — approved 2026-09-02 (§4.2).** Gate 2 / Gate B: merge authority for this docs + prototype record only (§12). Gate 5 (skill pairing) — both `flow-by-flow` and `flow-prototype` present at version 2.0.1: PASS. |

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
│  account credits · entitlement                     │   │                                           │
│                                            │   │  Tables (§197 LAYER 2): tenant_products,  │
│  Tables (§197 LAYER 1): platform_          │   │  tenant_prices, tenant_orders,            │
│  subscription_plans, platform_             │   │  tenant_service_subscriptions             │
│  subscriptions, platform_invoices,         │   │                                           │
│  platform_usage_events; LAYER 3 pass-through: platform_metered_events; Marketplace:       │
│  marketplace_items / _installs / _install_ledger (payer/recipient = LAYER 1 by rule;       │
│  §197 does not yet enumerate marketplace_* — amendment owed)                                │
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
| Trial substrate | exists, wired | A 14-day self-serve trial (`trial_period_days` on the checkout session, `platform-subscription-checkout/index.ts:467`) and a super-admin 30-day invite lane (`paige_invite_tokens`, migration `20260726140000` part C, `:231`); `platform_subscriptions.status` takes `trialing` (webhook `:692-706`, hook `useSoloComms.ts:68`). A time-bounded trial is therefore an EXISTING mechanism the beta decision can reuse (D3 option iv) |
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
| Allowance model (included units, thresholds, warnings) | **does not exist** | `platform_subscription_plans.metered_addons` on `main` carries `sms_included` (solo) and `sms_included` / `white_label` / `reseller_economics` (agency) after migration `20260726140000` stripped `credit_pulls_per_month`; no column, RPC, or job knows an allowance, a threshold, or a warning |
| Tenant-facing usage read | none | tier matrix §MET1 ledger: "No consumer surface exists yet, and none is claimed" |
| Stripe metered subscription item | none | no `subscription_items` / `meter_events` call anywhere in `supabase/functions` |
| Telephony (phone number) charge | Twilio buy is wired; **the CHARGE leg is not** | `comms-purchase-number/index.ts:25-29` — response carries `charge_wired: false`; `platform_number_pricing` holds wholesale + retail. When billed it is §197 LAYER 3 pass-through (`platform_metered_events`, reconciled to a LAYER 1 invoice only through `platform_metering_reconciliation.invoice_id`) |

### 2.5 Marketplace paid add-ons

| Item | State | Evidence |
|---|---|---|
| Item pricing fields | exist | `marketplace_items.price_cents`, `pricing_model`, `billing_period`, `take_rate_bps`, `available_to_tiers` |
| Paid purchase leg | one-time only (`mode: "payment"`), JWT-gated, pre-charge parity gates | `marketplace-checkout-session/index.ts:286` and header; webhook `checkout.session.completed` arm keyed on `marketplace_item_slug` then calls install |
| Recurring add-on subscription | **none** | Money Spine B-v "scoped, not started" (`docs/doctrine/money-spine-architecture.md`) |
| Entitlement record | `marketplace_installs` (status `active` / `disabled` / `uninstalled` / `update_available`, CHECK at `20260714270000:142`) + append-only `marketplace_install_ledger` | migrations `20260714270000`, `20260714330000` |
| Solo Marketplace UI | entitlement actions **deliberately UNAVAILABLE** ("Installation, removal, updates, purchase, and activation wait for immutable release authority…") | `src/solo/marketplace.tsx:79` |
| All current items | first-party, price 0 | `marketplace-checkout-session` header: "the only vendor today is first-party 'paige'" |

### 2.6 Operator configuration surfaces

| Item | State | Evidence |
|---|---|---|
| Operator Revenue → Plans / Metering / Invoices | **spec shells with null values**; tier names ship, prices/credits/rates deliberately do not | `src/operator/surfaces/specs/moneySpecs.ts:164-280` (`value: null` on every stat) |
| Operator upsert seam for plans | none for `platform_subscription_plans` (rows exist only via migration) | grep `platform_subscription_plans` in `supabase/functions` — read-only in checkout |
| Operator upsert seam for Marketplace items | exists | `marketplace_upsert_item` (`20260714192625:24`, redefined `20260714340000:171`) with the `price_cents >= 0` raise at `20260714192625:118` |

### 2.7 Per-tier availability of Settings → Billing (§51 / §56 — decided on purpose)

| Tier | Does a platform-billing surface exist for it today? | What it should show (proposed, §61 default unless ruled) | Evidence |
|---|---|---|---|
| God / Super Admin | No workspace plan of its own; operator Revenue → Plans / Metering / Invoices are spec shells with null figures. Reaches a tenant's billing by act-as, never by carrying the tenant flag. | The operator configuration flow (prototype `operator-plan-config`, `operator-addon-config`); never a "your plan" card | `src/operator/surfaces/specs/moneySpecs.ts:164-280` |
| Agency | Yes — `src/agency/billing.tsx` (Claude Design pack port; three sub-tabs Sub-account billing · Revenue · Your plan) fed by `useAgencyBilling.ts`, **DISPLAY-ONLY** with an honesty banner: invoice states and revenue are stand-ins; the L1 plan read (`agency` $397) is real where matched. Not this workstream's surface; shares the LAYER 1 tables and the same A1/A3 findings. | **NOT AVAILABLE** until a real supported Agency platform-billing contract exists (R8); the book it bills to its sub-accounts is the agency's business (§38), not platform billing | `src/agency/data/useAgencyBilling.ts:1-24`, `src/agency/billing.tsx:1-30` |
| Enterprise | Same shell as Agency (§65) plus customizations; `enterprise` plan row is custom-quote ($0, "contact sales"); no self-serve checkout (`platform-subscription-checkout` rejects a $0 recurring session) | **NOT AVAILABLE** until a supported Enterprise contract exists (R8); **UNVERIFIED** whether any Enterprise tenant exists live (tier matrix records the `enterprise` phantom) | checkout pre-charge gate; `docs/doctrine/tier-matrix.md` hazards |
| Solo | **This surface** — `PARTIAL` read-only | Everything in §9 | `src/solo/settings.tsx:1457-1459` |
| Sub-account | Same Solo shell; the plan read is skipped by design (`useSoloComms.ts:333`); today misreported as "no plan" (A4) | **NOT APPLICABLE** state (prototype `plan-subaccount`): platform billing is not silently inherited from the agency and no supported sub-account contract exists yet, so the screen says exactly that — never "no subscription", never "billed by your agency" (R8) | `useSoloComms.ts:333` |
| Client | Never. A client sees only their portal; a Solo's client billing is Sales-side (LAYER 2). | Nothing | RLS on every LAYER 1 table keys on `current_user_tenant_id()` or platform owner |
| Anonymous | Never. Public pricing lives on the landing page only. | Nothing | `PricingSection.tsx` |

---

## 3. Audit findings (ranked; nothing fixed in Phase 1)

| # | Severity | Finding | Evidence | Accountable owner · phase |
|---|---|---|---|---|
| **A1** | **HIGH (§9 / boundary)** | The Stripe-hosted portal and subscription check resolve the Stripe Customer by the **signed-in person's email**, not by the workspace's `platform_subscriptions.stripe_customer_id`. A person in two workspaces, or an owner who used a personal email for a legacy L2 purchase, lands in the wrong customer. There is also no tenant-admin gate on the portal. | `customer-portal/index.ts:43-47`, `check-subscription/index.ts:58-59` | **Platform Billing workstream · Billing Foundation A** — must be closed before any Solo "Manage billing" control exists |
| **A2** | **HIGH (§38 / entitlement)** | `install_marketplace_item` (4-arg overload, `GRANT EXECUTE … TO authenticated`) installs **any listed item regardless of `price_cents`** and writes a ledger row with `gross_cents = price_cents` that was never collected. The payment-first path exists only because the UI and checkout call it *that way*; nothing structural stops a tenant admin from calling `marketplace-install` (or the RPC from Chat, §10) on a paid item. Today all items are price 0, so no money is lost yet — but this is exactly "Install silently becomes Charge/entitlement". | live 4-arg body `20260714330000_marketplace_bundle_refcount.sql:636-681` (wrapper; `GRANT … TO authenticated` at `:681`) → `_marketplace_install_node` ledger write `:558-577` (`_gross := COALESCE(_item.price_cents, 0)`, no payment or price gate); header of `marketplace-checkout-session` ("install is payment-AGNOSTIC") | **Marketplace workstream** (durable handoff `docs/handoff/platform-billing-marketplace-addon-handoff.md`); Billing's add-on slice depends on it and will not ship around it |
| **A3** | MEDIUM (§197 cross-layer) | The webhook's `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.created` and `charge.refunded` arms are **not discriminated on `platform_plan_slug`**: a paid platform invoice would upsert an L2 `tier_state` row for the owner's email with tier "standard", and a failed platform payment updates `user_subscriptions`, never `platform_subscriptions` (status still arrives via `customer.subscription.updated`). | `stripe-webhook/index.ts:1488-1685` | **Platform Billing workstream · Billing Foundation B** |
| **A4** | MEDIUM (§13 truth) | Sub-account Billing states "no subscription record was returned" when the read was skipped on purpose. | `useSoloComms.ts:333`, `settings.tsx:1459` | **Platform Billing workstream · Billing Foundation B** (truth projection) and **C** (NOT APPLICABLE state, R8) |
| **A5** | LOW (§2 — corrected) | The 2026-07-02 seed put `credit_pulls_per_month` (a finance-vertical unit) into the platform-default `solo`/`agency` plan JSON. **Migration `20260726140000:57-66` already strips it on `main`.** What remains open is only proof: **UNVERIFIED** whether the prod rows reflect the strip (needs one live read of `platform_subscription_plans.metered_addons`). *An earlier draft of this packet reported A5 as an open MEDIUM defect; that was a §13 miss caught by the compliance pass and corrected here.* | `20260702035703:99-103` (seed), `20260726140000:57-66` (strip) | Billing Foundation (operator configuration audit) — confirm on prod, nothing to design |
| **A6** | LOW | `platform_invoices` has no writer (referenced only by its creating migration and the generated types), so any "Invoices" list from our tables would be empty and misleading; only the Stripe-hosted portal can show invoices truthfully today. | grep | Beta Base Plan (portal entry) |
| **A7** | LOW | No annual Stripe Price is registered; annual checkout uses inline `price_data`. Any beta Price decision must state monthly/annual explicitly. | checkout PRICE block | Beta policy decision |
| **A8** | INFO | Telephony purchase records the retail price and explicitly reports `charge_wired: false`. Honest today; becomes a meter only under sequence step 5. | `comms-purchase-number/index.ts:25-29` | Additional meters |
| **A9** | INFO (outside this workstream) | The LAYER 4 `consumer_subscription_plans` seed still carries `credit_pulls_per_month` and `funding_recommendations` (three rows each). Consumer-direct is a 2027 rail with empty tables; logged for the L4 owner, not a Platform Billing item. | `20260702035703:116-130` | none here |

---

## 4. Beta commercial direction — modelled; ruled at Gate 1 (§4.2–§4.4; §4.1 kept for the record)

**Approved product direction for the prototype only** (owner, 2026-09-02): reference plan
$149/month; intended beta base $74.50/month; a defined included allowance for selected
AI/autonomy/chat/platform usage; real observed usage and cost evidence required before any
automatic overage. **This authorizes a prototype state. It does not authorize a Stripe Product,
Price, Coupon, Customer, Subscription, or a plan-row change.**

### 4.1 The decisions as put to the owner (superseded by the §4.2 rulings; kept for the record)

| # | Decision | Options seen in the evidence | Recommendation (reversible `ASSUMED` until ruled) | If chosen differently |
|---|---|---|---|---|
| D1 | **Beta eligibility** | (a) every new Solo workspace during the beta window · (b) invite/list only · (c) tier-gated (Solo only, never Agency/Enterprise) | (a)+(c): every Solo workspace that provisions inside the window; Agency/Enterprise excluded | (b) needs an allow-list seam that does not exist |
| D2 | **Start / end / grandfathering** | fixed calendar window · N-workspace cap · lifetime lock at signup tier (the 2026-07-21 rollout doc's founding-wave pattern) | fixed window + lifetime lock for those who joined in it, matching the rollout doc's bounded-cohort principle | a rolling "until we say so" beta has no end state for the screen to show |
| D3 | **Stripe mechanism** | (i) a separate Stripe Price on the same Product · (ii) a time-bounded Coupon/promotion on the $149 Price · (iii) a separate Product · (iv) the EXISTING trial lane (`trial_period_days` / `paige_invite_tokens`, §2.2) — a $0 window, not a reduced price | (i) separate Price `solo-beta` on the existing Solo Product: the plan row can carry it, the webhook's `platform_plan_slug` discriminant still works, and the after-beta transition is a Price swap, not a coupon expiry the UI cannot see | (ii) makes "what plan am I on after beta" invisible to our tables (coupons are not on `platform_subscriptions`); (iv) gives a free period, not $74.50, and its end is a Stripe trial-end, not a price step |
| D4 | **State after beta ends** | auto-move to $149 with notice · stay at $74.50 for life (grandfather) · pause and ask | grandfather for in-window joiners (per D2); new joiners after the window pay $149 | auto-move needs a scheduled Price swap + notice job — none exists |
| D5 | **Exact included allowances** | units must come from what is measured: `llm_tokens` today; `tts_char`; nothing else is metered | define the beta allowance in **AI usage units the meter actually records** (tokens, or a credit that maps to tokens with a published ratio); publish the ratio | any "chat messages" or "actions" unit has no source event today and would be an estimate — never billable |
| D6 | **Warning and limit behaviour** | warn at 75% / 90% / 100% · warn only · hard stop | warn at 75% and 90%; at 100% keep the workspace usable and show "included allowance used"; no stop during beta | a hard stop needs an enforcement point at the action bus (see §7) which is not built |
| D7 | **After allowance is exhausted** | usable · limited (Paige drafts but does not act) · paused | usable during beta, evidence-gathering only | limited/paused needs the Trust Compass ↔ quota gate (§7) |
| D8 | **Overage** | automatic · opt-in · unavailable during beta | **unavailable during beta** — the owner's own condition ("real observed usage and cost evidence before automatic overage charges") | automatic overage needs a Stripe metered item, reconciliation, and an owner-approved rate; none exists |

Every D-row renders as a prototype state so the owner can see the consequence before ruling.

### 4.2 Gate 1 rulings (owner, 2026-09-02) — mapped onto D1–D8 and the boundary

The owner approved Gate 1 with eight rulings. The decision ids above are preserved; the ruling is
stated beside each one. Where a ruling defers a detail to a later packet, that is recorded as the
answer — nothing below is invented.

| Decision | Ruling | Status |
|---|---|---|
| D1 eligibility | Beta reference is **$74.50/month per top-level Solo workspace**. Precise eligibility (who, and existing-customer treatment) is defined in the **Beta activation** Gate B packet, a separate commercial release after Foundations A–C. | scoped; detail deferred to Beta activation |
| D2 start / end / grandfather | Effective date, existing-customer treatment, renewal and cancellation behaviour are defined in the Beta activation packet. **Existing subscriptions are never silently mutated.** | deferred to Beta activation |
| D3 Stripe mechanism | A **new, explicit $74.50 beta plan/price** created through the approved provider workflow, sandbox/test mode first — not a coupon, not a mutation of the $149 Price. The $149 price stays as current-state evidence only. | ruled |
| D4 after beta | Defined in the Beta activation packet (renewal/cancellation behaviour). Never a silent change to an existing subscription. | deferred to Beta activation |
| D5 included allowances | **Included-usage visibility only.** Units come only from server-authoritative platform events; a client-side estimate is never billable. Each meter is added one at a time with its own source, unit, included allowance, reset period, delayed-event handling and unavailable state. | ruled (visibility only) |
| D6 warnings / limits | Visibility only. No limit is enforced in this sequence; any future limit is its own owner ruling and lives at the action-bus clamp (§7), never in the Billing screen. | ruled (no enforcement) |
| D7 after exhaustion | Usable. No hidden usage billing, no automatic charge. | ruled |
| D8 overage | **None.** No automatic overage charges. A meter may trigger a charge only after a later specific owner ruling and its own Gate B. | ruled |

**Boundary and posture rulings (beyond D1–D8):**

| # | Ruling | Effect on this packet |
|---|---|---|
| R1 Billing account identity | One explicit, server-authoritative platform billing identity maps to one **top-level Solo workspace**. Never find or create a Stripe customer by the signed-in person's email. | Confirms A1 as HIGH; it is the first slice (Billing Foundation A) |
| R2 Billing authority | MVP: **only the workspace Owner** may open the customer portal, manage the payment method, modify/cancel the platform subscription, or see invoice history. Admin and Member controls **fail closed with a clear explanation**. A "Billing Manager" role is separate later work. | Supersedes the packet's earlier "owner/admin" wording; prototype viewer control now Owner / Admin / Member with Admin refused |
| R3 Portal design | Stripe's hosted customer portal for payment methods, invoices, subscription management. PAIGE never collects or stores card details in its own interface. | `portal-entry` is the only payment-method surface; no card form ever |
| R4 Beta plan | See D1–D4. | — |
| R5 Trial posture | Preserve and model genuine trial state where the substrate supports it (it does — §2.2 trial row, `plan-trialing`); **do not advertise, activate, or invent a public free trial** until a later explicit decision defines duration, eligibility, conversion and cancellation. | `plan-trialing` stays a modelled real status, never a marketed offer |
| R6 Usage and limits | See D5–D8. | — |
| R7 Marketplace paid add-ons | Visible price → explicit tenant approval → verified payment → entitlement. **"Install" alone never creates payment, entitlement, or a ledger entry saying money was collected.** A Marketplace install is not a payment and must never be recorded as one. | Confirms A2 as HIGH; owner = Marketplace workstream; ledger stays distinct from the Marketplace activity record |
| R8 Truthful state language | A skipped read, an unavailable provider contract, a missing mapping, or an unsupported tier displays **as that**. Never render "no subscription", "paid", "active" or "collected" without server-authoritative proof. | Confirms A4; sub-account, Agency and Enterprise show **NOT AVAILABLE / NOT APPLICABLE**, never "no subscription" and never an inherited plan (§2.7 corrected) |

### 4.3 Second clarification (owner, 2026-09-02) — Solo is canonical; three beta access offers; one entitlement model

**R9 Solo is the canonical billing experience.** The Solo shell — its tokens, hierarchy, width
behaviour, truth chips, empty states and interaction quality — is the pattern for Billing. The
Platform Operator billing screens are a configuration/control-plane surface and are **not** the
visual model for Solo; an Operator prototype must never become the de facto product design. The
prototype's operator screen is therefore labelled control-plane-only. The final Billing flow is
proven at every required Solo viewport and in both palettes (Foundation C).

| Role | Relationship |
|---|---|
| Platform Operator | creates plans, defines beta eligibility, grants promotions, configures policy, audits billing state |
| Solo workspace Owner | sees a polished, truthful explanation of what the workspace has, what it costs, when it renews or expires, and what action is available |
| Solo Admin / Member | the established clear refusal state for billing management (R2) |

**R10 Three approved beta access offers — modelled as explicit workspace-level billing
entitlements, each with a source, a start, an end or renewal condition, and an audit trail. All
three stay prototype/design truth until their safe backend contract exists.**

| Offer | Definition (as ruled) | Prototype state |
|---|---|---|
| **Paid Beta Plan** | $74.50/month per top-level Solo workspace. No provider price is created or activated until the separate exact Gate B provider-action release. The current $149 state is never silently rewritten. | `plan-beta` |
| **30-Day Beta Trial** | A qualifying Solo workspace may receive 30 days of platform access at $0 during beta. The owner clearly sees that it is a trial, how many days remain, and what happens next. **No silent charge at trial end.** At trial end the workspace moves to a truthful "Choose a plan / trial ended" state unless a paid plan or promotional grant is already active. The workspace and its data are preserved; it is never deleted and never shown as paid. | `plan-trialing`, `plan-trial-ended` |
| **Promotional / Complimentary Access** | Operator-granted, workspace-scoped, attributed to the granting operator, auditable, with an explicit duration or an explicitly recorded no-expiry policy. **Not a paid subscription — never creates a payment or invoice record.** Solo shows the honest status ("Promotional access through [date]" / "Complimentary beta access") and never exposes internal operator rationale unless that rationale is intentionally tenant-visible. A grant ends or is replaced by a paid plan through a clear, durable state transition, never silent mutation. | `plan-promo` |

**R11 One normalized entitlement model.** One server-owned read answers "what does this workspace
have right now", and the answer names its **source**. Proposed shape (design truth; built in
Foundation B, consumed in Foundation C — the Solo UI never invents access state locally):

```
workspace_billing_entitlement (projection, server-derived, tenant-pinned)
  source        : paid_subscription | beta_trial | promotional_grant | none
  status        : active | trialing | past_due | cancel_scheduled | canceled | expired | not_applicable | unavailable
  label         : tenant-visible copy only (never operator rationale)
  starts_at, ends_at (null + explicit no_expiry=true for an open-ended grant)
  days_remaining (trial / grant), renews_at (paid), next: what happens at ends_at
  evidence      : the record ids the projection was derived from (audit, never shown raw)
```

**Precedence rule (ASSUMED, reversible — the owner asked for a documented rule, not last-write-wins):**
1. an active or trialing **paid subscription** (a real provider subscription on this workspace) wins —
   it is the contract the owner is paying for;
2. otherwise an active, unexpired **promotional grant** (including the R12 current-account Promotional Beta Access cohort — an explicit record per workspace, never inferred);
3. otherwise an unexpired **beta trial**;
4. otherwise the most recently ended entitlement decides the *ended* state (`trial-ended`,
   `expired`, `canceled`), and the action is "Choose a plan".
A grant being replaced by a paid plan is a recorded transition (grant `superseded_by` the
subscription), not an overwrite. Two records that would both claim to be current are a data
defect the projection reports as `unavailable`, never resolves silently.

**Data and authorization requirements carried into the Foundation slices** (design, not built here):

| Requirement | Slice |
|---|---|
| One explicit workspace ↔ platform billing customer mapping row; server-derived active workspace; no email lookup anywhere | A |
| Owner-only portal session creation; short-lived session URL; never stored client-side; safe refusal on absent/ambiguous mapping; no fallback to another workspace; audit row per portal open | A |
| Promotional grant record: `tenant_id`, kind/reason code (operator-only), tenant-visible label, `granted_by` operator, `starts_at`, `ends_at` or explicit `no_expiry`, `revoked_at`/`superseded_by`, audit trail; **operator-only writes** (`is_platform_operator()`), tenant read of its own tenant-visible fields only | B |
| Trial truth from the real provider subscription (`status='trialing'`, trial end from the subscription record), never from a local flag | B |
| The entitlement projection above, plus the precedence rule as code with tests for every overlap | B |
| Solo Billing screen renders **only** what the projection returns; twelve required states (§9.1) | C |

**Out of scope for the initial Billing Foundation (ruled):** public coupon codes, automatic
discounts, automatic overages, live Stripe price creation, card collection, subscription
conversion, tax logic, a self-serve promotion editor. Promotional grants are Operator-controlled;
a tenant never self-grants; a Marketplace installation never creates a billing entitlement.

### 4.4 Third addition (owner, 2026-09-02) — current-account Promotional Beta Access policy, reporting truth, release discipline

**R12 Current-account policy.** All currently eligible top-level platform workspaces are to be
placed on **Promotional Beta Access** when the safe Billing Foundation is ready. This is not a
paid plan, a trial, an invoice, a Stripe customer creation, a coupon, or a retroactive charge. It
means: active platform access · $0 owed during the promotional period · no payment method required
· no invoice created · no Stripe subscription created or modified solely because of this status ·
no automatic later conversion to a paid plan · the access remains in force until a future explicit
Operator decision changes that workspace's entitlement. The Solo screen states it plainly:

> **Promotional beta access** — You have full platform access during beta. No payment is due.

No internal operator note or sensitive reason is ever exposed to the tenant.

**R13 Never a fallback.** Logic of the form *"if no subscription exists, treat the workspace as
promotional"* is forbidden: it would grant free access to every future account and conceal broken
billing state. Promotional access exists only as an **explicit, attributable, server-authoritative,
tenant-scoped workspace-level entitlement record** carrying: workspace identity · entitlement source
`promotional_beta` · granted by / source of grant · start date · explicit no-expiry **or** a recorded
end date · current status · audit trail · any future conversion/revocation reference. The
entitlement projection (§4.3, R11) returns `source=none` → "Choose a plan" when no record exists;
it never infers a grant. (This is the same discipline as A2's rule that an install is never a
payment: absence of a record is absence of the thing.)

**R14 Eligibility inventory before any mutation.** Before any promotional rollout: (1) re-ground
the current platform account inventory; (2) produce the exact eligible-workspace count and list for
review in the rollout's Gate B packet; (3) classify exceptions separately and explicitly —
platform/operator/system workspaces · test/demo workspaces · Agency/business parents · Agency
sub-accounts · inactive/deleted/invalid workspaces · any workspace already tied to a real paid
subscription; (4) never silently include or exclude an exception; (5) alter no memberships, roles,
Stripe records, subscription records, or payment records as part of the inventory. The rollout is
a **dedicated, reversible, production-data entitlement release** with its own exact Gate B naming
the final eligible count, exclusions, rollout mechanism, rollback behaviour, and post-deployment
verification. It is not part of PR #803 and not part of any generic schema migration.

**R15 Billing reporting truth.** Promotional workspaces are **never** counted as paid subscribers,
collected revenue, MRR/ARR, invoices due, successful payments, or conversion. They **may** be counted
separately as: promotional active workspaces · beta access cohort · promotional plan-value
equivalent (clearly labelled non-revenue) · product usage/cost cohort · future conversion cohort.
Usage/cost visibility stays separate from entitlement: verified platform usage and future provider
cost may be measured; promotional users are never charged automatically. (This binds the operator
Revenue surfaces and the `tenant_revenue_classification` chain, §57/§17 — a promotional grant maps
to the existing `promotional` revenue class, never `paid`.)

**R16 Paid-subscriber release discipline.** Once paid subscriptions exist, every material release
classifies its subscriber impact — no customer impact · UI-only · behaviour change · entitlement/plan
change · billing/provider change · data migration. Anything touching billing, entitlement, or paid
access: keeps backward compatibility or an explicit migration path · never silently changes price,
included allowance, renewal terms, or access · uses staged rollout/feature flags where appropriate ·
publishes an owner-facing change notice when it materially affects them · preserves exact audit and
rollback evidence · carries the completed Fable + independent review and an exact Gate B.

**R17 Future new-account offers (the approved set, unchanged from §4.3):** Promotional Beta Access
(Operator-granted, $0, explicit entitlement) · 30-Day Beta Trial (qualifying new workspace, $0 for 30
days, explicit trial record) · Paid Beta Plan ($74.50/month per top-level Solo workspace, only after
a separately approved live provider release). A trial end never silently charges; it transitions to
"Choose a plan" unless an active paid or promotional entitlement already exists.

**Sequence as ruled (final):** 1 finish and merge the corrected Gate 1 record (#803) under its own
exact Gate B → 2 Billing Foundation A and B (workspace billing identity, authorization, webhook
truth, honest states) → 3 the Solo Billing experience (Foundation C) → 4 the dedicated Promotional
Beta Access rollout packet with exact inventory and exclusions → 5 separate Gate B authority before
any production entitlement record is created → 6 later, the 30-day trial and the $74.50 paid beta
plan through separate provider-action releases.

**Sequence as ruled (first form, kept for the record):** Billing Foundation A (workspace identity and authority — A1) → Foundation B
(webhook classification and subscription truth — A3, A4) → Foundation C (truthful Solo Billing
screen) → Beta activation (separate commercial release, provider action) → Usage visibility, one
meter at a time, no automatic overages → Marketplace paid add-ons (with the Marketplace owner).
Every production outcome is a small slice with its own exact-head Gate B; nothing merges, deploys,
applies a production migration, touches a live Stripe object, or alters a subscription without it.

---

## 5. Recommended MVP billing sequence (refined)

Each step is its own slice with its own Gate 1/Gate 2, own crew, own §32 proof. Nothing here is
started.

| # | Slice | What it delivers | Depends on | Owner decisions needed first |
|---|---|---|---|---|
| 1 | **Billing Foundation** | Workspace ↔ billing-account mapping (portal/subscription lookups keyed on an explicit workspace ↔ billing-customer mapping, **Owner-only** (R2) — fixes A1); webhook arms discriminated on `platform_plan_slug` for invoice/refund events (A3); `platform_invoices` gets its sole writer (the webhook) or is declared not-a-source; entitlement projection = one read seam that says plan · status · renewal · included allowance · add-ons; operator configuration audit (A5) | nothing | none (A5 needs a prod read, not a decision) |
| 2 | **Beta Base Plan + truthful Billing screen** | Plan/status/renewal from the projection; sub-account **NOT APPLICABLE** state (A4, R8); Stripe-hosted portal entry via the fixed mapping; the $74.50 state rendered **only after** D1–D4 are ruled and the Price exists | 1 | D1, D2, D4 (deferred to the Beta activation packet); D3 ruled |
| 3 | **Included-usage visibility** | One server-owned usage read (from `platform_usage_events`, tenant-scoped) with allowance and 75/90/100% warnings computed server-side — the browser never sums usage or counts active add-ons itself (§57); **no automatic overage**; MET2 evidence that the drain runs on prod is a precondition | 1, 2, MET2 | none — D5–D8 ruled (visibility only, no automatic overage) |
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
| Reconciliation method | how our sum is checked against the provider and the invoice | **missing** — no Stripe meter, no `reconciled_invoice_id` writer (LAYER 1 usage) and no `platform_metering_reconciliation` writer (LAYER 3 pass-through — the only sanctioned cross-layer bridge, §197 rule 2) |
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
   (`marketplace_upsert_item` exists; cadence/cancellation fields for a recurring item do not);
2. the Solo workspace sees the price and the billing effect before enabling it;
3. an authorized billing decision occurs (the workspace **Owner**, R2, through the one approval gate);
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
| F1 | Solo owner (Admin/Member read plan only) | See what my workspace pays the platform and when it renews | PARTIAL read (`trialing` is a real status today) | `plan-current`, `plan-beta`, `plan-trialing`, `plan-promo`, `plan-trial-ended`, `plan-cancel-scheduled`, `plan-canceled`, `plan-none`, `plan-loading`, `plan-error`, `billing-unavailable` |
| F2 | Solo **Owner only** (R2) | Update card / download invoices via the hosted portal | UNAVAILABLE (A1, A6) | `portal-entry`, `portal-unavailable` |
| F3 | Solo owner (Admin/Member read only) | See included allowance and how much is used | UNAVAILABLE | `usage-included`, `usage-warn-75`, `usage-warn-90`, `usage-exhausted`, `usage-no-meter` |
| F4 | Solo **Owner only** (R2) | Enable a paid add-on and understand the charge | UNAVAILABLE by design | `addon-available`, `addon-selected`, `addon-pending`, `addon-active`, `addon-declined`, `addon-failed`, `addon-cancel-scheduled`, `addon-not-billable`, `addon-included` |
| F5 | Solo Admin or Member | Understand why I cannot manage billing (fail closed, R2) | not handled | `role-refusal` |
| F6 | Owner of several workspaces | Switch account and see the right billing | not handled (A1) | `account-switch` |
| F7 | Sub-account owner | See that platform billing is not applicable here yet (R8) | misreported (A4) | `plan-subaccount` |
| F8 | Solo owner | Find client invoices | no pointer | `client-billing-boundary` |
| F9 | Platform operator | Configure plan / beta price / add-on price and policy | spec shells | `operator-plan-config`, `operator-addon-config` |

### 9.1 The twelve required Solo Billing states (owner, 2026-09-02) — each mapped to a prototype state

| Required state | Prototype state id | Source when built |
|---|---|---|
| active paid beta plan | `plan-beta` | projection `source=paid_subscription`, `status=active` on the beta price |
| 30-day trial with remaining time | `plan-trialing` | `source=beta_trial` or `paid_subscription/trialing`, `days_remaining` |
| promotional / complimentary access | `plan-promo` | `source=promotional_grant`, tenant-visible label, `ends_at` or no-expiry |
| trial ended / plan selection required | `plan-trial-ended` (and `plan-none` when a successful read finds no entitlement at all) | `status=expired`, prior source `beta_trial`; action "Choose a plan" |
| paid subscription scheduled to cancel | `plan-cancel-scheduled` | `cancel_at_period_end=true` on the provider subscription |
| canceled / expired access | `plan-canceled` | `status=canceled` or `expired` |
| unsupported scope or tier | `plan-subaccount` (sub-account), `plan-unsupported` (Agency / Enterprise) | `status=not_applicable`, R8 |
| billing unavailable | `billing-unavailable` | mapping or provider contract missing — distinct from a failed read |
| loading | `plan-loading` | — |
| error with retry | `plan-error` | read failed; retry offered |
| owner-authorized manage-billing action | `portal-entry` (Owner viewer) | Foundation A portal session |
| admin / member refusal | `role-refusal` | R2 |

**Never rendered:** "no subscription" for a skipped, unsupported, or unavailable read.

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
| Static / build | docs only; `verify` CI expected green |
| Structural / harness render | `docs/prototypes/platform-billing-gate1.drive.mjs` (committed beside the prototype) drives it in headless Chromium through every control and asserts all 34 `data-state` ids are reached and member-viewer controls are disabled. Result on this head: `required 34 · seen 34 · missing [] · memberButtonsDisabled true · adminButtonsDisabled true · pageErrors []`. The Admin/Member assertion is taken in the plan=current · portal=entry state, where the Owner has exactly two enabled acts (`ownerActs 2`), and requires: zero plan-action buttons, a present-and-disabled portal button, every add-on control disabled, and the refusal card visible — never an `every()` over zero elements. (The script filters the sandbox's blocked Google Fonts fetch, a network fact rather than a prototype defect.) The prototype is a browser simulation with deterministic local state and **no network beyond that stylesheet, no mutation, no Stripe** |
| Authenticated runtime on the real platform | **not driven** — no browser/JWT capability in this session; the current Billing tab's rendered behaviour is inferred from source only |
| UNVERIFIED | whether `meter-llm-usage-hourly` runs on prod (#737); whether `solo.stripe_price_id` still resolves live; the exact Stripe account (legacy vs V2) the platform subscription rail uses in production |

---

## 12. Gate 1 — approved; Gate B request for this record

Gate 1 approved 2026-09-02. The questions as originally put (kept for the record) were:

1. the Platform ↔ Client boundary as drawn (§1);
2. the Settings → Billing shape: subscription · portal entry · included usage · add-ons · boundary
   pointer, in that order;
3. D1–D8 (§4.1) — each with its recommendation, or a different answer;
4. the sequence in §5 and whether Billing Foundation (step 1) may be briefed as the next slice.

**Gate 1 was approved on 2026-09-02 with the rulings in §4.2.** The Gate B request for PR #803 asks
for exactly one thing: **authority to merge this documentation and prototype record.** It does not
ask for, and its merge does not grant, any Stripe or provider action, meter, charge, portal
configuration, migration, production entitlement record (the Promotional Beta Access rollout is its
own Gate B, R14), or billing implementation — each of those sits behind its own
exact-head Gate B in the sequence above.
