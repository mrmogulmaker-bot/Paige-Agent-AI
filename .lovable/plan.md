
# MMA OS Bridge Integration — Implementation Plan (revised)

Removed all dispute-letter references — that lives on Mogul Credit AI, not here. Paige Agent AI stays on the MMA business side only.

## 1. Shared bridge client (server-side only)

New file: `supabase/functions/_shared/mmaOsBridge.ts`

- Exports `callMmaOsBridge(verb, payload, opts?)` — POST to `${MMA_OS_BRIDGE_URL}` with `Authorization: Bearer ${MMA_OS_BRIDGE_API_KEY}`, body `{ verb, payload }`.
- Reuses the existing retry/backoff logic from `stripe-webhook` (4 attempts, exponential, 10s timeout, treats 408/425/429/5xx as transient).
- `fireAndForgetBridge(verb, payload)` wraps in `EdgeRuntime.waitUntil(...)` for request handlers.
- On terminal failure, inserts a row into `mma_os_bridge_outbox` (see §3) for cron-driven retry.
- Never throws to caller. Structured logs `{verb, attempt, status}`.

Secrets already set: `MMA_OS_BRIDGE_URL`, `MMA_OS_BRIDGE_API_KEY` (recommend rotating since the value was pasted in plaintext).

## 2. Where each verb gets wired

All calls server-side. Token never ships to browsers.

### Verb 1 — `update_paige_member_state`
- `stripe-webhook` — on subscription create/update/cancel (tier, MRR cents, status, started_at). Extends current `fireMmaOsTierSync`.
- `check-subscription` — when reconciliation flips tier.
- New `paige-session-ping` edge function — called from `GlobalAuthSessionManager` on sign-in and once per session (debounced); updates `paige_last_login_at`, `paige_last_active_at`, `paige_total_logins`, `paige_total_session_minutes`, and a server-computed `paige_health_score`.
- DB trigger on `public.clients` for `assigned_coach_user_id` changes → calls state-change forwarder via pg_net.

### Verb 2 — `record_paige_feature_use`
New `paige-feature-event` edge function. Called from:
- `paige-ai-chat` — when a coach tool completes (`feature_category: "coaching"`, `feature_key: <coach_name>`).
- Funding journey transitions (`useFundingJourney` mutations).
- KPI achievements (credit score milestone, fundability score crossed threshold) from `calculate-credit-factors` / build-score refresh.
- Onboarding completions (`DemographicQuestionsStep`, `BusinessWalkthrough`).
- Lender outreach draft generation (`generate-outreach-draft`) — `feature_key: "lender_outreach"`.

### Verb 3 — `record_cross_system_event`
Generic event firehose. Called from:
- `handle_new_user` trigger → `auth.first_login`.
- Voice session start/end in `PaigeAIChat.tsx` (proxied through `paige-feature-event`).
- Subscription lifecycle (`upgrade_clicked`, `trial_started`, `subscription_canceled`) from `create-trial-checkout` + `stripe-webhook`.
- `useAnalytics` events on a namespace whitelist get mirrored.

### Verb 4 — `record_member_event`
Business outcomes only. Called from:
- `funding_journey_applications` insert with `outcome = funded` → `funding_closed` w/ `value_cents`.
- `businesses` insert with `entity_type` set → `llc_formed`.
- `businesses.ein` first populated → `ein_obtained`.
- `connected_bank_accounts` first row for a business → `business_banking_setup`.
- `build_milestones` completion with milestone_type in {revenue_milestone, business_credit_built} → mapped event_type.

Implementation: Postgres triggers on those tables → `pg_net` POST to new `paige-outcome-emit` edge function which forwards to bridge.

## 3. Failure handling & retry queue

New table `public.mma_os_bridge_outbox` (service-role-only RLS, GRANTs included):

```text
id uuid pk, verb text, payload jsonb, attempts int default 0,
last_error text, next_retry_at timestamptz, created_at, updated_at,
delivered_at timestamptz null
```

- Helper writes a row only after in-request retries exhaust.
- pg_cron every 5 min → `mma-os-bridge-flush` edge function — pops up to 100 due rows, retries with same backoff (exp to 24h cap, max 12 attempts → dead-letter via `last_error`).
- Admin Settings → "System Metrics" gets a small panel showing pending/dead-letter counts.

## 4. Identity mapping

- Canonical id: `auth.users.id` (uuid). Every call includes `email` + `paige_user_id`.
- Surfaces with only `clients.id` (contact, not yet linked to auth) send `email` only.
- No Paige schema change. Ask MMA OS to add `paige_user_id` lookup column on contacts (you offered).

## 5. Backfill

One-shot edge function `mma-os-backfill` (admin-invoked, idempotent):

1. Every `auth.users` row → `update_paige_member_state` with current subscription tier, MRR (from `user_subscriptions`), `paige_account_created_at`, `paige_first_login_at` (proxy: `last_sign_in_at`), assigned coach.
2. Existing `funding_journey_applications` with funded outcome → `record_member_event funding_closed`.
3. Every `businesses` row → `llc_formed` + `ein_obtained` (when applicable) using `created_at`.
4. Sampled distinct chat sessions → `record_cross_system_event coaching session_start` (one per session).
5. All rows include `external_ref: "backfill:<uuid>"` for MMA OS dedupe.

Batches of 500, 250 ms between, progress to `audit_logs`. Triggered from Admin Settings → System Metrics → "Backfill MMA OS ledger" (admin-only, behind confirmation dialog).

## 6. What we need from MMA OS

- Confirm `external_ref` is honored as idempotency key on all 4 verbs.
- Add `paige_user_id` lookup column on contacts (you offered).
- Optional inbound webhook `POST /functions/v1/mma-os-inbound` on Paige side so MMA OS can notify Paige when a member's stage changes (Premium → VIP → DFY). Paige updates `clients.lifecycle_stage` + `assigned_coach_user_id`. Sign with HMAC over body using shared key.
- Rotate `MMA_OS_BRIDGE_API_KEY` since plaintext was shared in chat.

## 7. Compliance guardrails (§75)

Bridge client has a hardcoded **payload denylist** — never forwards consumer-credit-regulated fields: `ssn_*`, `date_of_birth`, `credit_score`, `fico_*`, `tradeline_*`, `bureau_*`, `dispute_*`, `credit_report_*`. Unit test in `_shared/__tests__/mmaOsBridge.test.ts` asserts they're stripped before send. Paige Agent AI stays MMA business-side; nothing consumer-credit-regulated crosses the wall to MMA OS. Mogul Credit AI handles all dispute/credit-bureau workflows on its own separate spine.

## 8. Rollout order

1. Migration: `mma_os_bridge_outbox` table + GRANTs + RLS + cron schedule.
2. `_shared/mmaOsBridge.ts` + tests.
3. Refactor `stripe-webhook` to use shared helper (no behavior change).
4. Ship `paige-session-ping`, `paige-feature-event`, `paige-outcome-emit` edge functions + DB triggers.
5. Wire client-side hooks (session ping, voice events) through the new edge functions.
6. Ship `mma-os-bridge-flush` cron + admin counters.
7. Ship `mma-os-backfill` and run for seeded BTF cohort.
8. (After MMA OS confirms) Ship `mma-os-inbound` for reverse-direction stage updates.

---

**Migrations:** 2 (outbox + business-outcome triggers)
**New edge functions:** 5 (`paige-session-ping`, `paige-feature-event`, `paige-outcome-emit`, `mma-os-bridge-flush`, `mma-os-backfill`) + 1 optional (`mma-os-inbound`)
**Modified:** `stripe-webhook`, `check-subscription`, `paige-ai-chat`, `generate-outreach-draft`, `create-trial-checkout`, `GlobalAuthSessionManager.tsx`, `PaigeAIChat.tsx`, `AdminSettingsHub.tsx`

Approve and I'll ship in the order above.
