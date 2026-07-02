# Doctrine §205 — Metering Safety Net: Fire-and-Forget with Dead-Letter Reconciliation

**Status:** Active (shipped alongside `platform_metered_events_dead_letter` migration)
**Related:** §120 (Data Loss Case Studies), §66 (Test Discipline), §73 (Live-Mode Promotion), §197 (Billing Layer Taxonomy)

---

## The Rule

Metering emitters MUST NOT block user actions. Failed metering writes MUST NOT be silently dropped. Every metering event has a durable safety net that guarantees at-least-once eventual delivery to Stripe.

---

## The 7-Provision Contract (Option A)

1. **User action runs first, commits independently.** The overage-triggering action (extra credit pull, extra CFO Coach session, extra business profile) completes and returns success to the user *before* any metering write is attempted.

2. **Metering emit is fire-and-forget in a `try/catch`.** Wrapped so that a thrown error, Stripe outage, or network timeout can never bubble back to the user request path.

3. **On failure → dead-letter, not drop.** Failed writes go to `public.platform_metered_events_dead_letter` with full payload, error class, attempt count, `first_failed_at`, `last_failed_at`, and idempotency key.

4. **Admin notification on dead-letter insert.** `AFTER INSERT` trigger fans out to `paige_admin_notifications` with `severity='warning'`, `category='billing_metering'`, and dollars-at-risk in metadata. Revenue leak surfaces within minutes, not at month-end reconciliation.

5. **Retry job (pg_cron, every 15 min).** `pmedl_retry_scan()` marks pending rows past `next_retry_at` for the metering edge function to re-drain. Exponential backoff is applied by the edge function. After 10 attempts, row is auto-escalated to `status='requires_manual_review'` with a `severity='critical'` admin notification.

6. **Never block on Stripe availability.** Stripe usage-record calls happen inside the metering worker, not the user request path. If Stripe is down, the event still lands in `platform_metered_events` locally and syncs to Stripe on the next reconciliation pass (`platform_metering_reconciliation`).

7. **Event-type-specific idempotency keys.** Retries can never double-bill. Coarse `iso_hour` keys are forbidden — they lose information for event-based overages and over-count for monthly baselines.

---

## Idempotency Key Schema (locked)

| Event type                     | Key pattern                                                       |
|--------------------------------|-------------------------------------------------------------------|
| `credit_refresh_included`      | `{user_id}:credit_refresh_included:{iso_yyyymm}`                  |
| `credit_inquiry_overage`       | `{user_id}:credit_inquiry_overage:{credit_pull_id}`               |
| `cfo_coach_session_included`   | `{user_id}:cfo_coach_session_included:{session_id}`               |
| `cfo_coach_session_overage`    | `{user_id}:cfo_coach_session_overage:{session_id}`                |
| `business_profile_overage`     | `{user_id}:business_profile_overage:{profile_id}:{iso_yyyymm}`    |

The dead-letter table enforces `UNIQUE(idempotency_key)`. Any retry that regenerates the same key is silently no-op'd instead of double-charging.

---

## Observability

- `admin_metering_dead_letter_summary()` RPC — grouped by `event_type` + `status`, returns `row_count`, `dollars_at_risk`, `oldest_failure`, `most_recent_failure`. Admin/super_admin only. Ships Day 1, before Sprint P.3 dashboards, so admin notifications always fire with context attached.
- `paige_admin_notifications` category `billing_metering` — subscribe here for real-time alerts.
- `platform_metering_reconciliation` — periodic parity sweep between local events and Stripe usage records (Sprint P.3).

---

## What is forbidden

- ❌ Awaiting a Stripe API call inside a user request handler.
- ❌ Swallowing a metering error with a bare `catch { /* ignore */ }`.
- ❌ Using `iso_hour` (or any time bucket coarser than a specific resource id) as an idempotency key for event-based overages.
- ❌ Reprocessing a dead-letter row without preserving its idempotency key.
- ❌ Promoting emitters to live Stripe mode without 5-pass verification per §73.

---

## Verification checklist (§66)

Before flipping any emitter to live mode:

1. Force a failure in test — confirm row lands in `platform_metered_events_dead_letter`.
2. Confirm `paige_admin_notifications` fires with dollars-at-risk in metadata.
3. Confirm `admin_metering_dead_letter_summary()` returns the row grouped correctly.
4. Confirm retry cron picks it up and re-drains.
5. Confirm duplicate emit with the same idempotency key is a no-op, not a double-bill.

Only after all five pass — and Antonio signs off — does live-mode promotion happen (§73).
