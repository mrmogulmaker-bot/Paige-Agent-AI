# Migration B.0 — Row-Level Layer Classification Audit (Preflight)

**Date:** 2026-07-02
**Target legacy table:** `public.user_subscriptions`
**Discipline invoked:** §198 Addendum (row-level classification) + §208 (verified state)
**Status:** ✅ Preflight complete. Path B recommended.

---

## Section 0.1 — Per-Row Classification (19 rows)

Reproducible source query in `docs/security/MIGRATION_B_SHAPE_PROPOSAL.md` Section 1; classification query:

```sql
SELECT us.id, us.user_id, us.plan_slug, us.status, us.stripe_subscription_id,
       us.trial_ends_at, us.created_at,
       u.email, u.last_sign_in_at,
       (SELECT string_agg(tm.tenant_id::text||':'||tm.role, ',')
          FROM public.tenant_members tm WHERE tm.user_id = us.user_id)      AS tenant_membership,
       (SELECT string_agg(DISTINCT cl.tenant_id::text, ',')
          FROM public.clients cl WHERE cl.linked_user_id = us.user_id)      AS client_in_tenants,
       (SELECT count(*) FROM public.coach_clients cc
          WHERE cc.client_user_id = us.user_id OR cc.coach_user_id = us.user_id) AS coach_link,
       (SELECT count(*) FROM public.deals d WHERE d.owner_user_id = us.user_id) AS deals_owned,
       (SELECT count(*) FROM public.consumer_subscriptions cs
          WHERE cs.user_id = us.user_id)                                    AS consumer_sub_rows,
       (SELECT array_agg(DISTINCT ur.role::text) FROM public.user_roles ur
          WHERE ur.user_id = us.user_id)                                    AS roles
FROM public.user_subscriptions us
LEFT JOIN auth.users u ON u.id = us.user_id
ORDER BY us.created_at;
```

### Verified row-level facts

| Fact | Value | Evidence |
|---|---|---|
| Total rows | **19** | direct count |
| `plan_slug = 'free'` | **19 / 19** | 100% |
| `status = 'trial'` | **19 / 19** | 100% |
| `stripe_subscription_id IS NOT NULL` | **0 / 19** | 100% never Stripe-linked |
| Linked to MMA tenant `a25194e0-…` as an end-customer via `clients.linked_user_id` | **16 / 19** | tenant-scoped passthrough |
| Linked to MMA tenant via `tenant_members` (staff role) | **4 / 19** | overlap allowed |
| Rows with **no** tenant linkage (`clients` **and** `tenant_members` both empty) | **0 / 19** | zero orphans |
| Rows with a counterpart in `consumer_subscriptions` | **0 / 19** | zero L4 shadow |
| `roles` observed | `{client,user}` on end customers; `{admin,coach,user}` on staff | additive, tenant-scoped |
| `last_sign_in_at` present | 8 / 19 active recently; 11 dormant | activity data captured, not gating |

### Per-row classification

Because all 19 rows share the identical shape (`plan_slug='free'`, `status='trial'`, `stripe_subscription_id NULL`) and every row has verified tenant linkage, the individual per-row bucket assignment collapses to two clusters — captured in Section 0.2 rather than repeated 19 times. No row falls into `L4_misrouted`, `pre_signup`, or `unclassifiable`.

---

## Section 0.2 — Row Classification Summary

| Bucket (§206 discriminator) | Count | Notes |
|---|---:|---|
| `L2_tenant_trial_active` — tenant staff on trial gate | **4** | rows for MMA `tenant_members` (admin/coach/member). Staff trial signup for internal use. |
| `L3_tenant_passthrough_trial` — tenant end-customer on trial gate | **15** | rows for MMA `clients.linked_user_id` end customers. (One row overlaps staff/client dual-role — assigned to staff cluster.) |
| `L2_tenant_trial_orphaned` | **0** | zero rows without tenant linkage |
| `L4_misrouted` | **0** | zero rows with paying/consumer artifacts |
| `pre_signup` | **0** | every `user_id` resolves in `auth.users` |
| `unclassifiable` | **0** | |
| **Total** | **19** | matches source |

**Conclusion:** the table holds **only tenant-scoped trial state**. It contains **zero L4 (direct consumer) rows**. The C9 audit finding was a **code-drift signal**, not a **data-layer signal**.

---

## Section 0.3 — Code-Site Write-Intent Classification (14 unique files)

Command used: `rg -l "user_subscriptions" -g '!node_modules' -g '!*.md' -g '!supabase/migrations' -g '!types.ts'`

| # | File | Op | Write intent | Classification |
|---:|---|---|---|---|
| 1 | `supabase/functions/stripe-webhook/index.ts` (8 refs) | UPSERT / UPDATE | Persist Stripe paying-customer subscription state | **L4_misrouted** — must repoint to `consumer_subscriptions` |
| 2 | `supabase/functions/check-subscription/index.ts` (3 write refs) | UPSERT / UPDATE from Stripe polling | Downgrade to `free`, sync plan from Stripe | **L4_misrouted** — must repoint to `consumer_subscriptions` |
| 3 | `supabase/migrations/20251010023044…sql` (`handle_new_user` trigger) | INSERT on signup | Seed 14-day trial gate for every new `auth.users` row scoped inside the MMA tenant | **L3_correct** (retain on renamed table) |
| 4 | `supabase/functions/admin-delete-user/index.ts` | DELETE cleanup | Cascade user delete | **layer-neutral cleanup** (repoint to renamed table) |
| 5 | `src/pages/Admin.tsx` | SELECT count active | Admin dashboard tile | **L3_read** (repoint) |
| 6 | `src/pages/admin/AnalyticsDashboard.tsx` | SELECT (3 refs) | Trial vs active counts | **L3_read** (repoint) |
| 7 | `src/contexts/SubscriptionContext.tsx` | SELECT + realtime channel | Per-user plan/trial gate | **L3_read** (repoint) |
| 8 | `src/components/dashboard/UpgradeBanner.tsx` | SELECT | Trial-remaining banner | **L3_read** (repoint) |
| 9 | `src/components/dashboard/UpgradeModal.tsx` | SELECT | Upgrade CTA gate | **L3_read** (repoint) |
| 10 | `src/components/dashboard/UserPerformance.tsx` | SELECT | Per-user tile | **L3_read** (repoint) |
| 11 | `src/components/dashboard/ClientFileView.tsx` | SELECT | Client plan display | **L3_read** (repoint) |
| 12 | `supabase/functions/export-clients-csv/index.ts` | SELECT | Tenant client export | **L3_read** (repoint) |
| 13 | `supabase/functions/paige-ai-chat/index.ts` | SELECT | Plan-based feature gate for Paige chat | **L3_read** (repoint) |
| 14 | `supabase/functions/paige-voice-chat/index.ts` | SELECT | Plan-based gate for Paige voice | **L3_read** (repoint) |
| 15 | `supabase/functions/ship-26-legacy-cleanup/index.ts` | Management/reporting | Explicit legacy-freeze tooling | **doctrine-tooling** (update table name reference) |

**Ambiguous count: 0.** No sites require human review before proceeding.

Write-intent bucket totals:
- `L4_misrouted` writes: **2 files** (`stripe-webhook`, `check-subscription`).
- `L3_correct` write (trigger): **1 file** (signup trigger).
- Layer-neutral cleanup: **1 file** (`admin-delete-user`).
- Pure reads: **10 files** (repoint only).
- Doctrine tooling: **1 file** (`ship-26-legacy-cleanup`).

---

## Section 0.4 — Path Recommendation

**Recommended path: PATH B (Split — mixed L3/L2 rows retained, L4 write intent redirected).**

Justification, grounded in Sections 0.1–0.3:

1. **No data copy to `consumer_subscriptions` is required.** All 19 rows are tenant-scoped trial state (L3 end-customer + L2 staff). Zero rows carry L4 signals (no `stripe_subscription_id`, no `consumer_subscriptions` shadow, no paying plan).
2. **Rename-in-place is required.** The table's current name (`user_subscriptions`) describes an L4 concept but the row identity is L3/L2. Keeping the name violates the §198 Addendum's "layer identity ≠ table name" rule going forward.
3. **Code sweep is a two-cluster split, not a monolithic cutover.** The L4-intent write paths (`stripe-webhook`, `check-subscription`) must redirect to `consumer_subscriptions`. All L3 reads plus the signup-trigger L3 write remain on the renamed table.
4. **PATH A rejected** because the code sweep is *not* purely a discipline issue — `stripe-webhook` genuinely writes L4-intent data that must not land in the renamed L3 table.
5. **PATH C rejected** because it would synthesize a `trial` status on the L4 catalog to accommodate rows that were never L4 to begin with — the exact §200/§202 pollution §198-Addendum was written to prevent.

---

## Draft Outline of Sections 3–9 (tuned to Path B)

**Section 3 — Copy Pattern.**
No row copy. In place of the "verified-copy" step, this ship performs a §208-verified **rename**:

```
public.user_subscriptions  →  public.tenant_trial_subscriptions
```

plus additive columns: `layer text NOT NULL CHECK (layer IN ('L2_tenant_service','L3_tenant_passthrough'))`, `tenant_id uuid NOT NULL` (backfilled to MMA tenant from linkage evidence, then constrained), and a `subject_type` / `subject_id` pair mirroring §206. RLS refreshed to require `tenant_id = current_user_tenant_id()`. Row count invariant: pre = post = 19.

**Section 4 — Verification Checkpoints.**
- Pre-flight: re-run §208 shape query + Section 0.1 classification query; assert identical row set.
- Post-rename: assert `count(*)` unchanged; assert every row has non-null `tenant_id`; assert `layer` populated per Section 0.2 clusters.
- Post code-sweep: assert no runtime references to `public.user_subscriptions` remain (rg gate in CI).

**Section 5 — Audit Trail.**
Write a row to `ecosystem_migration_log` (created in this ship if absent) capturing rename, backfill counts per bucket, and the exact classification query hash. Reference §198 Addendum + §208.

**Section 6 — Deprecation Flag.**
Register `public.tenant_trial_subscriptions` in `table_layer_registry` (§207) with `layer='L3_tenant_passthrough'` and `notes` capturing the L2/L3 dual population. Do **not** create a compatibility view named `user_subscriptions` — clean break.

**Section 7 — Write-Freeze Trigger (DISABLED at ship).**
Ship `pme_tts_freeze_l4_writes_trg` in the DISABLED state. It raises if an inserted row carries `stripe_subscription_id` (an L4 signal). Enable only after Section 8 code sweep verifies zero L4 writes reach the renamed table.

**Section 8 — Rollback Plan.**
Because Path B is rename-in-place with additive columns, rollback is symmetric:
- `ALTER TABLE public.tenant_trial_subscriptions RENAME TO user_subscriptions;`
- `ALTER TABLE ... DROP COLUMN layer, DROP COLUMN tenant_id, DROP COLUMN subject_type, DROP COLUMN subject_id;`
- Revert code sweep via git revert of the sweep commit.
Rollback preserves all 19 rows byte-for-byte.

**Section 9 — §198 Addendum extension.**
Committed in this PR at `docs/security/DOCTRINE_198_ADDENDUM_DEPRECATION_REQUIRES_CUTOVER.md` (Part 2). Motivating case study: this preflight.

---

## Ready-for-approval checklist

- [x] Section 0.1 — per-row classification produced from a reproducible query
- [x] Section 0.2 — bucket summary; zero ambiguous
- [x] Section 0.3 — code-site write intent per file; zero ambiguous
- [x] Section 0.4 — path recommendation grounded in data
- [x] §198 Addendum extension committed
- [ ] Human approval to proceed to full Sections 3–9 Migration B shape proposal on **Path B**
