
# Phase 3 Addendum — Connectors 7, 8, 9 (Capital-Readiness Lane)

Phase 3 connectors 1–6 (Sentry, PostHog, DocuSign, Cal.com, Apollo, Meta) are already shipped. This addendum extends Phase 3 with three business-owner / business-itself connectors and the two MMA-OS bridge verbs you'll consume.

## Scope rule encoded in code

A constant `PAIGE_SCOPE_GUARD` in `supabase/functions/_shared/scopeGuard.ts` documents the rule and is imported by every new function header as a comment marker:

> "Capital-readiness for the business or business owner. No consumer-credit dispute work, no CROA-classified services. SmartCredit is funding-eligibility lens only."

SmartCredit edge functions will hard-reject any payload field named `dispute*`, `fcra_*`, or `repair_*` (400 with `scope_violation`).

## 1. Database migration (single migration, all GRANTs + RLS)

New tables (all admin/coach-readable via `has_role`, service-role writable):

- `paige_business_credit_profiles` — `contact_id`, `business_name`, `ein`, `nav_profile_id`, `scores jsonb` (dnb, experian_business, equifax_business, paydex, intelliscore), `trade_lines jsonb`, `last_pulled_at`, `history jsonb`
- `paige_owner_credit_snapshots` — `contact_id`, `bureau` (enum: experian|equifax|transunion), `score int`, `pulled_at`, `factors jsonb`, `alerts_triggered jsonb`
- `paige_bank_connections` — `contact_id`, `plaid_item_id`, `plaid_access_token_encrypted` (pgcrypto, key from `_internal_secrets`), `institution_name`, `accounts jsonb`, `status`, `connected_at`, `last_synced_at`
- `paige_bank_transactions` — `bank_connection_id`, `plaid_transaction_id` (unique), `date`, `amount_cents`, `name`, `category jsonb`, `pending bool`, `account_id`
- `paige_cash_flow_snapshots` — `contact_id`, `period_start`, `period_end`, `total_deposits_cents`, `total_withdrawals_cents`, `avg_daily_balance_cents`, `runway_days`, `funding_readiness_score int`, `generated_at`

`paige_config` extensions:
- `nav_partner_id text`
- `smartcredit_enabled bool default false`
- `plaid_activated bool default false`
- `plaid_env text default 'sandbox'`

Reuse existing `qb_encrypt_token` / `qb_decrypt_token` pattern (service-role only) for Plaid access tokens — store ciphertext in `plaid_access_token_encrypted`, never plaintext.

## 2. Edge Functions

All admin-only via `_shared/adminAuth.ts`; webhooks JWT-disabled with HMAC verification.

**Nav.com (connector 7):**
- `nav-pull-profile` — POST `{contact_id}` → calls Nav API with `NAV_API_KEY`, upserts `paige_business_credit_profiles`, appends to `history`, fires `business_credit_score_changed` bridge verb if any score crosses a configurable threshold (default ±20 pts)
- `nav-refresh-scores` — cron-friendly batch refresh for active monitored businesses

**SmartCredit (connector 8):**
- `smartcredit-pull-snapshot` — POST `{contact_id}` → pulls owner's 3-bureau scores via `SMARTCREDIT_API_KEY`, writes `paige_owner_credit_snapshots`. Output presents "Business funding eligibility: strong/moderate/limited" — never a dispute path. Scope guard rejects dispute/repair payload fields.
- `handle-smartcredit-alert-webhook` — public, HMAC-verified, appends alerts to latest snapshot. On alert, fires `funding_readiness_assessed` bridge verb (composite with latest Nav + cash flow data if present).

**Plaid scaffolding (connector 9) — inactive until `paige_config.plaid_activated = true`:**

Each function checks the flag first; if false, returns `200 { activated: false, message: "Plaid not yet activated" }` so the UI renders cleanly.

- `plaid-link-token-create` — mints link token for a given `contact_id`
- `plaid-public-token-exchange` — exchanges public token, stores encrypted access token + accounts list
- `plaid-sync-transactions` — pulls /transactions/sync, upserts into `paige_bank_transactions`
- `plaid-generate-cash-flow-snapshot` — aggregates last 90d of transactions into `paige_cash_flow_snapshots`, computes `funding_readiness_score` (deposit consistency + avg balance + runway), fires `funding_readiness_assessed` bridge verb
- `handle-plaid-webhook` — public, verifies Plaid signature (Ed25519 verification key, same pattern as existing `handle-plaid-webhook` if present — extend rather than duplicate), processes `TRANSACTIONS:SYNC_UPDATES_AVAILABLE` and `ITEM:*` events

## 3. Bridge verbs (mma-os outbound)

Extend `supabase/functions/_shared/mmaOsBridge.ts` `BridgeVerb` union with:
- `business_credit_score_changed` — `{ contact_id, business_name, score_type, old_value, new_value, delta, snapshot_id }`
- `funding_readiness_assessed` — `{ contact_id, composite_score, components: { nav?, smartcredit?, cash_flow? }, recommended_lane }`

Both go through the existing outbox + retry/backoff infrastructure.

## 4. Admin UI

Three new routes wired into `src/pages/Admin.tsx` and added to the IntegrationsHub tile grid + "More" menu:

- `/admin/business-credit` (`BusinessCreditAdmin.tsx`) — table of monitored businesses, score-trend sparklines, "Pull now" action, threshold alert config
- `/admin/owner-credit` (`OwnerCreditAdmin.tsx`) — per-contact 3-bureau score history, alerts feed, funding-eligibility badge (no dispute UI, no "Fix this" CTAs — strictly read-only assessment)
- `/admin/banking` (`BankingAdmin.tsx`) — list of connected accounts (empty state explains "Plaid activation pending"), cash-flow snapshot cards with runway + funding readiness score; "Connect bank" CTA disabled until `paige_config.plaid_activated`

Config screens added to IntegrationsHub:
- `NavIntegrationConfig.tsx` — partner ID, refresh cadence, threshold delta
- `SmartCreditIntegrationConfig.tsx` — enable toggle + scope reminder banner ("Funding eligibility lens only")
- `PlaidIntegrationConfig.tsx` — env (sandbox/dev/prod), activated toggle, link-test button (disabled until secrets present)

## 5. Env / secrets manifest

To request from Antonio when ready:
- `NAV_API_KEY`, `NAV_PARTNER_ID`
- `SMARTCREDIT_API_KEY`, `SMARTCREDIT_WEBHOOK_SECRET`
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_WEBHOOK_VERIFICATION_KEY` (stubs accepted; functions short-circuit until set)

I won't trigger the secret prompts in this pass — scaffolding will deploy and idle until you say "go" per connector.

## 6. Compliance guardrails (permanent)

- Scope-guard constant referenced in every new function header
- SmartCredit edge functions reject dispute/repair payload fields with `scope_violation` (logged to `audit_logs`)
- No dispute UI, letter generation, or FCRA-enforcement surface added anywhere
- Owner-credit admin view labels itself "Funding Eligibility Lens" and links to a short copy block explaining the scope rule

## Out of scope (unchanged hard line)

Consumer credit dispute work, general credit-repair-as-a-service, personal credit issues unrelated to business funding, anything CROA-classified. Those remain in Mogul Credit / Mogul AI.

## Build sequence

1. DB migration (tables + GRANTs + RLS + paige_config columns)
2. Bridge verb type extension
3. Nav functions + admin UI
4. SmartCredit functions + admin UI (scope guard tests)
5. Plaid scaffolding (functions return inactive, UI shows pending state)
6. IntegrationsHub tile updates + route wiring
7. Verify `tsgo` clean

Approve and I'll build straight through.
