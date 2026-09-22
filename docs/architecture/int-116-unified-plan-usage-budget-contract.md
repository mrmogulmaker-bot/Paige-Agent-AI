# INT-116 — Unified plan usage budget contract

**Status:** OWNER-APPROVED CONTRACT · SHADOW-ONLY · NO ENFORCEMENT OR CHARGING

**Decision date:** 2026-09-21

**Applies to:** platform-paid provider usage for the one Solo plan and later plan tiers

**Does not change:** runtime, schema, provider configuration, Stripe, invoices, tenant data, or any live limit

## 1. Owner outcome and one-meter rule

The $297/month Solo plan includes one **$30 provider-cost allowance per plan period**. Voice/TTS, Live Conversation, chat/LLM, Vibe Studio, and every later platform-paid provider operation draw from that same allowance. Voice is not a standalone meter.

`public.platform_usage_events` is the one tenant-scoped usage ledger. Every in-scope source ultimately writes one append-only lifecycle there; provider traces and domain receipts may remain as diagnostic/provenance sources, but they do not calculate a second allowance, balance, charge, or enforcement decision.

This slice is contract-only. The $30 allowance, cost-plus-25% overage rule, warning thresholds, and $100 platform ceiling remain **shadow calculations** until later slices separately prove coverage, pricing, billing, and live-path safety.

## 2. Inclusion and exclusion

| Category | Included when Paige pays the provider | Canonical units retained | Cost basis |
|---|---|---|---|
| `llm` | chat, governed runtime turns, reasoning/evaluation, and Live Conversation reasoning | input/output/cache tokens and requests | provider rate-card snapshot; provider-confirmed cost when available |
| `speech_to_text` | dictation and Live Conversation ears | audio seconds/minutes | provider rate-card snapshot; provider-confirmed cost when available |
| `text_to_speech` | message read-aloud and Live Conversation mouth | characters and/or audio seconds | provider rate-card snapshot; provider-confirmed cost when available |
| `media` | Vibe image, edit, video, audio, and other generation | provider-native units plus job count | provider estimate reserved, then provider-confirmed actual when available |
| `tools` | any later platform-paid external API/tool with a measurable provider charge | provider-native unit | provider rate-card snapshot or confirmed receipt |

Included cost is the platform's direct provider cost attributable to a tenant. Failed operations settle to the actual non-refundable provider cost, if any; a failure is not assumed free.

Excluded:

- tenant-direct/BYOK credentials and charges paid directly by the tenant;
- the $297 subscription price, taxes, refunds, processor fees, Marketplace purchases, and tenant-to-client billing;
- internal labor, hosting, storage, and unpriced platform overhead unless the owner later adds a separately named rate class;
- unattributable platform/system activity (`tenant_id IS NULL`), which stays operator-visible but cannot be assigned to a tenant allowance;
- guessed or back-filled cost where no dated rate or provider receipt exists. Unknown cost is `NULL`, never zero.

## 3. Plan period, allowance, and catalog transition

For an ordinary subscription, the allowance period is the tenant's canonical `platform_subscriptions.current_period_start` (inclusive) through `current_period_end` (exclusive), not a calendar-month guess.

An active promotional grant with `metadata.no_expiry = true`, a valid `current_period_start`, and `current_period_end IS NULL` has no Stripe renewal period to copy. Its platform allowance cadence is instead a deterministic sequence of one-month UTC windows anchored to `current_period_start`: for timestamp `T`, choose the greatest non-negative integer `n` for which `anchor + n months <= T`, and resolve `[anchor + n months, anchor + (n + 1) months)`. This is a platform allowance window only; it does not invent or modify a Stripe billing, invoice, renewal, or expiry date. Reserve and coverage readback must use the same resolver. A normal subscription missing either boundary, or a no-expiry grant missing or ambiguously encoding its anchor, resolves to **coverage incomplete** in shadow reporting; it never blocks a user while enforcement is off.

Plan configuration belongs on the canonical `platform_subscription_plans` lineage. A later migration will replace the deployed Solo `$149` catalog price and the `$74.50` beta offer with the owner-approved **$297/month** Solo offer, while preserving immutable invoice/subscription history. It must:

1. add versioned usage-budget configuration to the canonical plan catalog (included provider cost = `$30.00`, warning thresholds = `80%` and `100%`, overage policy initially disabled/shadow);
2. create or select the new Stripe Price only in a separately authorized billing slice;
3. define explicit effective-date and grandfathering behavior before moving existing subscriptions;
4. update every public and authenticated price surface atomically with checkout/fulfillment configuration; and
5. prove invoice, webhook, portal, renewal, cancellation, and promotional-grant behavior before activation.

No price, subscription, Stripe object, or entitlement changes in this contract slice.

## 4. Ledger event contract

The future schema extends `platform_usage_events`; it does not create a parallel usage table. Each logical operation uses a caller-generated UUID/idempotency key and has at most one current lifecycle:

- `reserved` — estimated provider cost held before dispatch;
- `settled` — actual cost recorded after an authoritative provider result;
- `released` — unused reservation returned when dispatch did not incur cost;
- `ambiguous` — dispatch may have incurred cost but no authoritative result exists; it remains reserved until reconciliation.

Required typed fields (columns rather than policy-critical JSON) are: tenant, operation/idempotency key, category, source, provider, model/product, state, native quantity/unit, reserved cost USD, settled cost USD, rate-card snapshot ID, plan-period start/end, funding source, optional prepaid-entitlement ID and exact entitlement quantity/unit debited, occurred/settled timestamps, and an optional source receipt/trace identifier. Metadata remains redacted descriptive context only.

Rules:

- reserve makes one atomic funding decision before dispatch. It locks and checks **every selected funding source**: (a) the tenant's effective allowance—the plan allowance reduced by any tenant restriction; (b) the platform ceiling; and, for an eligible media operation that will draw purchased credits, (c) the media-only prepaid entitlement. The transaction reserves both the USD amount and the exact `media_credit` units selected before provider dispatch. A duplicate/idempotent reserve returns the existing lifecycle with the same funding-source debit and cannot reserve or debit the entitlement again;
- settle/release is idempotent and may transition only the matching reservation;
- settlement records actual provider cost when authoritative; otherwise it retains an explicitly estimated amount and provenance;
- `ambiguous` never becomes zero automatically and is reconciled by receipt/readback or an explicit expiry policy;
- totals use `settled + active reserved + ambiguous`, preventing concurrency from overspending a cap;
- state changes are append-only events or an equivalently immutable transition history; no caller may rewrite financial history in place;
- client-visible category totals derive from this ledger only.

Every platform-paid provider dispatcher, including the shared LLM/model-routing seam, must reserve synchronously before its first provider call once enforcement is enabled. `paige_llm_trace` remains LLM provenance: its writer settles or reconciles the matching reservation, while the existing hourly drain is limited to historical backfill and missing-settlement repair. An after-dispatch drain can never satisfy or replace the reserve gate.

## 5. Versioned rate-card snapshots

A rate card is platform billing configuration, not tenant data. Each immutable snapshot names provider, product/model, unit, input/output/cache distinctions where applicable, USD price, minimum/rounding rules, source URL or contract reference, effective interval, and who approved it. A reservation pins the snapshot used; later rate changes never rewrite prior usage. Future prepaid purchases separately snapshot their purchased quantity, unit, paid amount, and immutable receipt; a provider rate card must not be used to fabricate missing purchase provenance for a legacy entitlement.

Provider-confirmed actual cost wins for settlement. If a provider supplies usage but not cost, the pinned snapshot calculates an **estimated** cost and the ledger preserves that label. If neither a confirmed cost nor a valid snapshot exists, the source is unpriced/coverage-incomplete; shadow reporting shows the gap and enforcement remains off.

## 6. Authority and tenant isolation (INT-100)

- **Platform function:** only the platform owner, through a dedicated capability-gated platform function, may create/activate rate cards, set plan allowances/overage policy, or change the global emergency ceiling. This is platform configuration.
- **Tenant preference:** a tenant owner/admin may only lower that tenant's resolved allowance or disable provider-funded usage. The tenant function cannot raise the plan allowance, alter a rate, enable overage, or affect another tenant.
- **No platform tenant-data write:** a platform role does not call the tenant preference function or impersonate tenant authority. Provisioning resolves the platform plan assignment/configuration; it does not write a tenant preference row unless the tenant later chooses a restriction.
- Direct table writes are denied to browser roles. Server callers use narrowly granted functions, derive tenant/actor identity server-side, and produce audit evidence without prompt, transcript, or secret content.

## 7. Shadow policy and later enforcement

Initial behavior is observation only:

- warn in the eventual billing view at 80% and 100%; do not block;
- calculate overage at **provider cost + 25%**, aggregated by plan period, but do not invoice or charge;
- keep metered overage opt-in disabled until billing and owner consent are separately approved;
- the future non-overage default stops **before the next discrete operation**, never during one already dispatched;
- Live Conversation finishes the current spoken turn at a bounded graceful boundary, then stops accepting the next paid turn; an emergency stop prevents new dispatch and cancels safely where the provider supports cancellation, but does not fabricate a refund;
- the **$100/month platform emergency cap** is a controlled-rollout ceiling across in-scope platform-paid usage. Its period and timezone must be explicit in implementation. It starts shadow-only and cannot become enforcement until coverage readback is complete.

No warning, stop, overage, or ceiling is live merely because this contract names it.

## 8. Existing meters: reuse, migrate, retire

- `platform_usage_events`: **reuse and extend** as the sole plan-usage ledger. Existing `llm_tokens` and `tts_char` rows remain historical source-unit evidence.
- `paige_llm_trace`: **retain as LLM observability/provenance**. The shared model dispatcher writes the pre-dispatch reservation; a trace settles/reconciles it. The current hourly drain is historical/backfill repair only, never the live enforcement gate.
- `paige_media_credit_entries` and media hold/consume/release: **migrate provider-usage lifecycle and history into the unified ledger, then retire as an allowance/balance authority only after prepaid value is preserved**. Outstanding non-expiring `grant_purchased` balances move one-for-one, in their existing `media_credit` units, into canonical Platform Billing prepaid entitlements restricted to `category = media`. A non-media operation cannot select or debit them. Where a legacy row lacks an immutable paid amount or receipt, migration copies only source fields that actually exist, records `provenance_status = unknown_legacy`, and does not invent a USD conversion, price, or receipt. That entitlement is not a usage meter and the purchase itself is not provider cost. The ledger still records the media operation's independently established provider cost; it also records the exact entitlement units debited. Unified reserve/settle draws the plan's included allowance first, then—only for media—preserved media-credit units, then separately authorized opt-in overage. Selection of prepaid funding is part of the same locked atomic reserve described in §4; no caller may read an entitlement balance and debit it later in a separate transaction. Funding-source fields ensure prepaid value is neither lost nor also counted against the `$30` allowance. Media job/receipt provenance may remain.
- `paige_voice_cost_reservations`, `paige_voice_*budget*`, and voice monthly-usage tables/functions from V1a: **retire after unified reserve/settle coverage and reconciliation are proven**. They stay unused and cannot be re-enabled as a parallel voice allowance.
- `platform_metered_events`: remains the separate Layer-3 tenant pass-through billing rail defined by Doctrine §197; it is not used to meter Paige's included plan allowance.
- legacy token-credit presentation (`included_ai_tokens_month`, `ai_credit_token_ratio`) is migrated to category detail under the one dollar-denominated allowance and then retired as an independent entitlement.

Migration is reconcile-first: map each legacy source record to one unified operation, preserve and reconcile every outstanding purchased-media balance in its exact existing units and media-only scope before retiring its balance authority, explicitly mark absent legacy purchase provenance as unknown, compare per-tenant/per-period totals, quarantine duplicates/unknown rates, prove exact coverage, switch readers/writers, then disable and later remove the old balance authority. No dual enforcement window.

## 9. Coverage and activation gates

Enforcement and charging remain off until a production readback proves, for **every active tenant** and every active provider-cost source:

1. exactly one valid allowance period and one plan allowance resolve, including the deterministic platform allowance window for every active no-expiry promotional grant;
2. every dispatched provider operation has one idempotent ledger lifecycle;
3. every settled operation has a confirmed cost or a pinned, dated estimate explicitly labelled as such;
4. legacy-versus-unified reconciliation has no unexplained delta, and every purchased-media entitlement preserves its exact unit balance, media-only restriction, and honestly known-or-unknown purchase provenance;
5. concurrency, duplicate, retry, ambiguous dispatch, rollover, tenant isolation, rate changes, and graceful Live Conversation boundaries pass;
6. the client billing breakdown equals the ledger and exposes unknown/unpriced coverage honestly; and
7. emergency-disable and rollback drills pass without taking already-allowed playback or conversation dark.

Only after a separate owner authorization may rollout progress: shadow telemetry → visible warnings → bounded cohort enforcement → opt-in metered overage. Any missing coverage keeps the affected operation shadow-only; it never silently becomes free or blocked.

## 10. Small-slice delivery order

1. **This contract (docs only):** decisions and boundaries; no runtime effect.
2. **Schema foundation, enforcement off:** additive ledger lifecycle fields, immutable rate-card snapshots, plan usage policy, restrictive tenant preference, RLS/grants/RPCs, and coverage-readback function with fail-first pgTAP.
3. **Writer convergence:** one provider-cost source at a time (LLM, TTS, STT/Live, media, tools), with synchronous pre-dispatch reservation at each shared dispatch seam, shadow settlement, and exact reconciliation; legacy writers remain read-only until each cutover proves parity.
4. **Client billing read model:** owner-visible period, `$30` included amount, total and per-category cost, estimated/confirmed labels, 80%/100% warnings, and overage projection; no charge controls yet.
5. **Catalog migration to $297:** separately authorized Stripe/catalog/UI/webhook change with grandfathering decision and end-to-end billing proof.
6. **Controlled enforcement:** only after all-tenant/source coverage readback passes; discrete-operation stop plus graceful Live Conversation boundary; key-less/old-client compatibility where applicable.
7. **Opt-in overage:** separately authorized billing activation at provider cost +25%, invoice reconciliation, disputes/refunds, and owner consent.
8. **Legacy retirement:** remove parallel budget/balance authority only after reconciliation, rollback window, and production proof.

## 11. Proof boundary and rollback position

This document changes policy intent only. It makes no schema or code change, no provider call, no cap write, no price/catalog mutation, no invoice, no deployment, and no customer-facing promise. Release channel: `not-applicable`; classification: internal-only; customer release eligibility: none.

Because no runtime changes, rollback is `git revert` of this document. Later implementation slices must carry their own forward-only database rollback and live-path recovery procedures.
