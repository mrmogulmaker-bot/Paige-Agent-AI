# Paige ↔ MMA OS — Direct Integration Architecture Plan

Reply to MMA Ops strategic brief. Plan only — no code changes until you greenlight each step.

---

## 1. Paige Supabase status — CONFIRMED ACTIVE

Your task #187 "PAUSED" flag is stale. Live status from the project right now:

- **Project ref:** `bfmyebsjyuoecmjskqhs`
- **Region:** `aws-1-eu-west-1`
- **Status:** ACTIVE_HEALTHY, responding normally, daily backups on.
- **URL pattern for Edge Functions:** `https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/<name>`
- **Anon key** already in MMA Ops hands from prior turn; service-role key stays Paige-side only.

Action for MMA Ops: close #187, replace with "Paige Supabase confirmed live, ref `bfmyebsjyuoecmjskqhs`." No unpause needed.

---

## 2. Stripe Edge Function — `stripe-webhook` v2

We already have `supabase/functions/stripe-webhook/index.ts` handling `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_succeeded/failed`. It's wired to legacy `user_subscriptions` + affiliate conversion. For the new Stripe account we'll keep the file (don't break legacy) and extend it.

**File:** `supabase/functions/stripe-webhook/index.ts` (extend, not replace)

**New secrets** (Project Settings → Secrets, both test + live):
- `STRIPE_SECRET_KEY_V2` — new account secret
- `STRIPE_WEBHOOK_SECRET_V2` — signing secret for new endpoint
- Existing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` stay (legacy account)
- `MMA_OS_BRIDGE_URL` = `https://mrmogulmaker.app.n8n.cloud/webhook/mma-supabase-bridge` (fallback) **and** new `MMA_OS_EDGE_URL` for direct Supabase-to-Supabase short-hop
- `MMA_OS_BRIDGE_API_KEY` — shared bearer for the short-hop call

**Account routing:** function tries `STRIPE_WEBHOOK_SECRET_V2` first, falls back to legacy secret. The verified `event.account` (or absence of it) tags which Stripe instance fired.

**Event handlers (additive):**
| Event | Action |
|---|---|
| `customer.subscription.created` | Upsert `clients` + write `tier_state` derived from price→tier map |
| `customer.subscription.updated` | Re-resolve tier, write `audit_logs` row, fire realtime via row update |
| `customer.subscription.deleted` | Tier → Standard, mark `status='inactive'` |
| `invoice.paid` | Record activity, refresh `tier_state.last_payment_at` |
| `invoice.payment_failed` | Activity + flag `tier_state.payment_status='past_due'` |
| `charge.refunded` | Activity + (if full refund) downgrade tier per policy |

**Tier resolution:** central `priceIdToTier()` map keyed by Stripe price IDs (Standard $8 / Premium $44 / VIP $97). One source of truth, lives in the function.

**Idempotency:** new table `stripe_event_log(event_id PK, account_id, type, received_at, processed_at, payload jsonb)`. Insert first with `ON CONFLICT DO NOTHING`; if conflict, return 200 immediately. Guarantees Stripe retries are no-ops.

**Audit trail:** every handled event writes one row to `audit_logs` (`event_type='stripe.<type>'`, `metadata=event payload digest`) AND one row to `communication_log` when a billing email goes out — satisfies §5 GLBA audit-trail rule.

**MMA OS short-hop:** after a successful tier change, POST to `MMA_OS_EDGE_URL` with `{ verb:'sync_tier', payload:{ contact_email, tier, source:'paige.stripe', occurred_at }}` and bearer `MMA_OS_BRIDGE_API_KEY`. Failure is logged but never blocks the 200 back to Stripe. n8n `/paige-tier-sync` webhook stays as belt-and-suspenders fallback.

**Multi-tenant:** every insert carries `organization_id` resolved from the Stripe customer's metadata (`metadata.org_id`) or falls back to the platform default org. Function rejects events whose org is unknown — logs to `audit_logs` with `severity='warn'`.

---

## 3. GHL → Paige sync — new `ghl-inbound-webhook` Edge Function

**File:** `supabase/functions/ghl-inbound-webhook/index.ts` (new, sibling to existing `handle-inbound-webhook`)

**Why not extend `handle-inbound-webhook`:** that one is the n8n bridge with `verb` routing and an HMAC shared with MMA Ops. GHL signs payloads differently and we want a clean per-source attack surface.

**Auth:** GHL webhook secret stored as `GHL_WEBHOOK_SECRET`. Validate `x-ghl-signature` HMAC-SHA256 over raw body before parsing.

**Cohort router (the heart of §3 / §12 lane separation):**
```
incoming GHL contact
  ├─ tags contain any of [premium, vip, btf-active, btf-nurture]
  │     → upsert into Paige `clients` + `tier_state`
  │     → log to `communication_log` (channel='ghl', message_type='contact.sync')
  └─ else (standard / lead-only)
        → POST to MMA_OS_EDGE_URL { verb:'upsert_contact', payload }
        → write `audit_logs` row noting routed-away, do NOT store PII in Paige
```

**Event types handled:** `ContactCreate`, `ContactUpdate`, `ContactTagUpdate`, `ContactDelete` (soft-delete in Paige + forward delete to MMA OS).

**Idempotency:** `ghl_event_log(event_id PK, ghl_contact_id, type, received_at)` — same pattern as Stripe.

**Compliance:** SSNs / DOB / credit data never accepted from GHL payload (rejected at schema). PII fields (email, phone, address) encrypted at rest via existing column-encryption pattern. Every routed-away contact logs a redaction record so we can prove to FCRA we never stored non-cohort PII in Paige.

**Legacy compat:** n8n `/webhook/paige-contact-upsert` stays live. We'll have GHL configured to hit BOTH for 30 days, then cut over.

---

## 4. Realtime subscriptions — make Paige UI live

**DB migration:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tier_state;  -- once table exists
ALTER TABLE public.clients REPLICA IDENTITY FULL;
```

**Frontend hook:** new `src/hooks/useRealtimeContact.ts` that:
- Takes `contactId`
- Subscribes inside a `useEffect` (mount→subscribe, unmount→`removeChannel` — per cloud-realtime guardrail, no bare channel calls at render scope)
- Listens to `postgres_changes` filtered by `id=eq.<contactId>` for `clients`, plus matching `tier_state` row
- Pushes updates into a React Query cache invalidation so the existing `ContactDetail` page re-renders automatically

**Where it lights up:**
- `src/pages/admin/ContactDetail.tsx` — header tier badge + stage select flip live
- `src/pages/admin/ContactsAdmin.tsx` — table row tier column updates without refetch
- `src/pages/admin/PipelineAdmin.tsx` — Kanban card moves columns when status changes server-side

**Latency target:** <1s end-to-end on tier flip (Stripe → Edge Function → Postgres → Realtime → UI). Realistic given Supabase Realtime SLO.

**RLS:** existing `clients` policies already scope to admin/coach role + assigned_coach_user_id, so realtime only delivers rows the viewer is allowed to read. No new policies needed.

---

## 5. Paige ↔ MMA OS cross-talk pattern

Two Supabase projects, lane-separated, occasionally need to share. Honest tradeoff table:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Edge Function → other project's Edge Function (HTTPS short-hop, bearer auth)** | Clean boundary, audit logs on both sides, no shared credentials beyond a bearer, easy to revoke, works with multi-tenant org_id passing | One extra hop (~150–300ms), need to manage retry/dead-letter | **RECOMMENDED for all writes** |
| B. Postgres FDW (foreign data wrapper) | "Feels" native, single query joins | Cross-project FDW needs db-direct creds shared, blows up Lane Separation (§12), no per-row audit, fragile when either side migrates | Reject |
| C. Direct `supabase-js` client with anon key from the other project, called from an Edge Function | Simple | Anon key in env of the other project, RLS would have to allow it which forces wide-open policies, no audit trail on caller side | Reject for writes; OK only for narrow public reads |
| D. Shared Postgres logical replication (one-way) | Real-time mirror, no app code | Schema coupling, both teams have to coordinate every migration, can't filter by cohort cleanly | Reject for now, revisit Phase 6 |

**The agreed pattern (Option A everywhere):**

```
Paige Edge Function ──HTTPS POST {verb,payload}──► MMA OS Edge Function (bridge)
  Authorization: Bearer MMA_OS_BRIDGE_API_KEY            │
                                                          ▼
                                                    MMA OS Postgres
MMA OS LangGraph agent ──HTTPS POST──► Paige Edge Function `mma-os-inbound`
  Authorization: Bearer PAIGE_INBOUND_API_KEY            │
                                                          ▼
                                                     Paige Postgres
```

**Direction matrix:**
| Trigger | Direction | Verb |
|---|---|---|
| Stripe charge in Paige | Paige → MMA OS | `sync_tier` |
| GHL contact in non-cohort | Paige → MMA OS | `upsert_contact` (routed away) |
| Skool tier change | MMA OS → Paige | `sync_tier` (if member is cohort-eligible) |
| Coach assignment in MMA OS | MMA OS → Paige | `assign_coach_to_client` (already wired in `handle-inbound-webhook`) |
| BTF graduation event | MMA OS → Paige | `upgrade_program_phase` (new verb) |

**New Paige inbound endpoint:** `supabase/functions/mma-os-inbound/index.ts` — single function dispatching by `verb`. Verb-level rate limiting via `api_rate_limits` table (already exists). Every call writes `audit_logs` with `source='mma_os'`.

**Secrets needed (request via add_secret when you greenlight #5):**
- `MMA_OS_BRIDGE_URL`, `MMA_OS_BRIDGE_API_KEY` (Paige side, calling out)
- `PAIGE_INBOUND_API_KEY` (MMA OS side, calling in to Paige) — generated random, shared once

**Compliance:** payloads must never carry SSN/credit data across the wire between the two projects. Schema rejects those fields. Only tier, contact identifiers (email/phone), org_id, and event metadata.

**n8n preserved:** every verb above maintains a parallel n8n route as fallback for 90 days. After confirmed parity we deprecate the n8n routes one at a time.

---

## Execution order (you set the pace, one PR per step)

1. ✅ Step 1 done — confirmed Paige active, ref `bfmyebsjyuoecmjskqhs`
2. **Step 2** — extend `stripe-webhook` for new Stripe account + idempotency + MMA OS short-hop. Needs: `STRIPE_SECRET_KEY_V2`, `STRIPE_WEBHOOK_SECRET_V2`, `MMA_OS_BRIDGE_URL`, `MMA_OS_BRIDGE_API_KEY`.
3. **Step 3** — `ghl-inbound-webhook` with cohort router. Needs: `GHL_WEBHOOK_SECRET`.
4. **Step 4** — Realtime publication + `useRealtimeContact` hook + wire into 3 admin pages.
5. **Step 5** — `mma-os-inbound` dispatcher + `PAIGE_INBOUND_API_KEY` + parity tests against n8n fallback.

Greenlight Step 2 and I'll ship.
