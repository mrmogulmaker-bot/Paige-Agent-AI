
# MMA OS Bridge Integration — Implementation Plan

Good news: the short-hop pattern already exists in `supabase/functions/stripe-webhook/index.ts` (`fireMmaOsTierSync` w/ exponential backoff, secrets `MMA_OS_BRIDGE_URL` + `MMA_OS_BRIDGE_API_KEY`). We'll generalize it into a shared helper and wire the 4 verbs across the surfaces that already emit those signals.

## 1. Shared bridge client (server-side only)

New file: `supabase/functions/_shared/mmaOsBridge.ts`

- Exports `callMmaOsBridge(verb, payload, opts?)` — POST to `${MMA_OS_BRIDGE_URL}` with `Authorization: Bearer ${MMA_OS_BRIDGE_API_KEY}`, body `{ verb, payload }`.
- Reuses the existing retry/backoff logic from `stripe-webhook` (4 attempts, exponential, 10s timeout, treats 408/425/429/5xx as transient).
- `EdgeRuntime.waitUntil(...)` wrapper `fireAndForgetBridge(verb, payload)` for fire-and-forget from request handlers.
- On terminal failure, inserts a row into a new `mma_os_bridge_outbox` table (see §3) for cron-driven retry.
- Never throws to caller. Logs structured `{verb, attempt, status}`.

Secrets needed (already set per earlier work — verify with `fetch_secrets`):
- `MMA_OS_BRIDGE_URL` → `https://slcqeiqcrhepicqxqjng.supabase.co/functions/v1/mma-os-bridge`
- `MMA_OS_BRIDGE_API_KEY` → `mma_bridge_4f8a2c91…` (rotate the value posted in chat since it's been shared in plaintext — we'll prompt Antonio to confirm/rotate)

## 2. Where each verb gets wired

All calls server-side (edge functions). Never from the React client — token must not ship to browsers.

### Verb 1 — `update_paige_member_state`
Surfaces that mutate member state:
- `supabase/functions/stripe-webhook/index.ts` — on subscription create/update/cancel (tier, MRR cents, status, started_at). Extends current `fireMmaOsTierSync` payload.
- `supabase/functions/check-subscription/index.ts` — when reconciliation flips tier.
- New tiny function `supabase/functions/paige-session-ping/index.ts` — called from `src/lib/auth/GlobalAuthSessionManager.tsx` on sign-in and once per session (debounced); updates `paige_last_login_at`, `paige_last_active_at`, `paige_total_logins`, `paige_total_session_minutes`, and recomputes a server-side `paige_health_score`.
- `assigned_coach_user_id` change trigger on `public.clients` → calls a `notify-paige-state-change` edge function via pg_net.

### Verb 2 — `record_paige_feature_use`
Wrapped into `paige-feature-event` edge function (new). Called from:
- `supabase/functions/paige-ai-chat/index.ts` — when a coach tool completes (`feature_category: "coaching"`, `feature_key: <coach_name>`).
- Funding journey transitions (`useFundingJourney` mutations → call helper).
- Dispute letter generated (`generate-dispute-letter`) → `feature_key: "dispute_letter"`.
- KPI achievements (credit score milestone, fundability score crossed threshold) emitted from `calculate-credit-factors` / build-score refresh.
- Onboarding step completion in `DemographicQuestionsStep` / `BusinessWalkthrough` via a `paige-feature-event` POST.

### Verb 3 — `record_cross_system_event`
Used as the generic event firehose. Called from:
- `handle_new_user` trigger → `auth.first_login` (via the new state-change edge function).
- Voice session start/end in `PaigeAIChat.tsx` (proxied through `paige-feature-event` so token stays server-side).
- Subscription lifecycle (`upgrade_clicked`, `trial_started`, `subscription_canceled`) — `trial_started` from `create-trial-checkout`, `subscription_canceled` from `stripe-webhook`.
- `useAnalytics` track events with namespace whitelist get mirrored.

### Verb 4 — `record_member_event`
Business-outcome only. Called from:
- `funding_journey_applications` insert with `outcome = funded` → `funding_closed` w/ `value_cents`.
- `businesses` insert with `entity_type` set → `llc_formed`.
- `businesses.ein` first populated → `ein_obtained`.
- `connected_bank_accounts` first row for a business → `business_banking_setup`.
- `build_milestones` completion with milestone_type in {revenue_milestone, business_credit_built} → mapped event_type.

Implementation: Postgres triggers on those tables → `pg_net` POST to a new `paige-outcome-emit` edge function which forwards to bridge. Triggers keep logic centralized and survive direct DB edits.

## 3. Failure handling & retry queue

New table `public.mma_os_bridge_outbox` (with GRANTs + RLS service-role-only):

```text
id uuid pk, verb text, payload jsonb, attempts int default 0,
last_error text, next_retry_at timestamptz, created_at, updated_at,
delivered_at timestamptz null
```

- Bridge helper writes a row only after the in-request retries exhaust.
- New cron (pg_cron, every 5 min) calls `mma-os-bridge-flush` edge function — pops up to 100 due rows, retries with same backoff helper, marks delivered or bumps `next_retry_at` (exponential to 24h cap, max 12 attempts → dead-letter via `last_error`).
- Admin Settings → "System Metrics" gets a small panel showing pending/dead-letter counts (read via existing `AdminSettingsHub`).

## 4. Identity mapping (email/contact_id)

- Paige's canonical identifier is `auth.users.id` (uuid). All bridge calls include both:
  - `email` (from `auth.users.email`)
  - `paige_user_id` = `auth.users.id`
- For surfaces where we only have `clients.id` (contact, not yet linked to auth), we send `email` only and omit `paige_user_id`. The bridge can match on email and we attach `paige_user_id` once `linked_user_id` is set.
- No schema change needed on Paige side. Request to MMA OS: store `paige_user_id` as a lookup column on contacts (you mentioned you can add it).

## 5. Backfill

One-shot edge function `mma-os-backfill` (admin-invoked, idempotent):

1. For every `auth.users` row: emit `update_paige_member_state` with current subscription tier, MRR (from `user_subscriptions`), `paige_account_created_at = users.created_at`, `paige_first_login_at = users.last_sign_in_at` (best available proxy), assigned coach.
2. For every existing `funding_journey_applications` with funded outcome → `record_member_event funding_closed`.
3. For every `businesses` row → `llc_formed` + `ein_obtained` (where applicable) using `created_at` as event timestamp.
4. For every `chat_messages` distinct session → `record_cross_system_event coaching session_start` (one per session, not per message — sampled).
5. All backfill rows include `external_ref: "backfill:<uuid>"` so MMA OS can dedupe.

Runs in batches of 500, sleeps 250ms between batches, writes progress to `audit_logs`. Triggered from Admin Settings → System Metrics → "Backfill MMA OS ledger" button (admin-only).

## 6. What we need from MMA OS

- Confirm bridge accepts `external_ref` as the idempotency key on all 4 verbs (already shown on verb 3 — please mirror on 1/2/4).
- Add `paige_user_id` lookup column on contacts table (you offered).
- Optional **inbound webhook** `POST /functions/v1/mma-os-inbound` on Paige side (we'll build) so MMA OS can notify Paige when a member's stage changes (e.g., Premium → VIP → DFY) — Paige would then update `clients.lifecycle_stage` and `assigned_coach_user_id`. We propose signing with the same shared key (HMAC over body) rather than bearer.
- Rotate `MMA_OS_BRIDGE_API_KEY` since it was pasted in chat plaintext.

## 7. Compliance guardrails (§75)

The bridge client has a hardcoded **payload denylist**: never forwards `ssn_*`, `date_of_birth`, `credit_score`, `fico_*`, `tradeline_*`, `dispute_*`, `bureau_*` fields. Unit test in `_shared/__tests__/mmaOsBridge.test.ts` asserts that consumer-credit fields are stripped before send. Paige stays on the MMA (business) side of the wall.

## 8. Rollout order

1. Migration: `mma_os_bridge_outbox` table + GRANTs + RLS + cron schedule.
2. `_shared/mmaOsBridge.ts` + tests.
3. Refactor `stripe-webhook` to use shared helper (no behavior change).
4. Ship `paige-session-ping`, `paige-feature-event`, `paige-outcome-emit` edge functions + DB triggers.
5. Wire client-side calls (session ping + voice events) via the new edge functions.
6. Ship `mma-os-bridge-flush` cron + admin panel counters.
7. Ship `mma-os-backfill` and run it for the seeded BTF cohort.
8. (After MMA OS confirms) Ship `mma-os-inbound` for reverse-direction stage updates.

---

**Estimated migrations:** 2 (outbox + triggers)
**New edge functions:** 5 (`paige-session-ping`, `paige-feature-event`, `paige-outcome-emit`, `mma-os-bridge-flush`, `mma-os-backfill`) + 1 optional (`mma-os-inbound`)
**Modified:** `stripe-webhook`, `check-subscription`, `paige-ai-chat`, `generate-dispute-letter`, `create-trial-checkout`, `GlobalAuthSessionManager.tsx`, `PaigeAIChat.tsx`, `AdminSettingsHub.tsx`

Approve and I'll ship in the order above. Want me to also gate the backfill button behind a confirmation dialog (recommended) given it'll emit thousands of events on first run?
