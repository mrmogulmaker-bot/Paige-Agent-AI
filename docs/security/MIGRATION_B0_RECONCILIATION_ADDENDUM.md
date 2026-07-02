# Migration B.0 — Addendum: Reconciliation Responses (2026-07-02)

Responses to the two open concerns raised after the initial B.0 audit.

---

## Concern #1 — L2 vs L3 Classification: **ACCEPTED (Option a)**

The initial draft classified 15 end-customer rows as `L3_tenant_passthrough_trial`. That was wrong under a strict §197 reading and is now formally corrected by **Doctrine §210 — L2 / L3 Scope Boundaries** (see `DOCTRINE_210_L2_L3_SCOPE_BOUNDARIES.md`, shipped in this same PR).

**Final classification of all 19 rows in `public.user_subscriptions`:**

| Cluster | Count | Layer | `subject_role` |
|---|---:|---|---|
| MMA end-customer trial state (via `clients.linked_user_id`) | **15** | L2 | `end_customer` |
| MMA staff trial state (via `tenant_members`) | **4** | L2 | `tenant_member` |
| **Total** | **19** | — | — |

**Discriminator column added by Migration B:**

```sql
subject_role TEXT NOT NULL CHECK (subject_role IN
  ('end_customer','tenant_member','consumer_user','platform_admin'));
```

Values `consumer_user` and `platform_admin` are reserved for L4 and future admin-only trial tables; they will not appear on the renamed L2 table but the CHECK is written once so the enum is stable ecosystem-wide (§210 canonicalization).

**Rename target (final): `public.tenant_customer_trials`.**
`tenant_service_trials` was considered and rejected because it implies the trial is scoped to a specific tenant service offering — the current 19 rows are not linked to `tenant_products`/`tenant_prices` and represent a generic tenant-level trial gate (`plan_slug='free'`). `tenant_customer_trials` reads correctly for both the end-customer (15) and staff (4) subject-role clusters.

**Migration B's discriminators are therefore two columns, not one:**

```sql
layer TEXT NOT NULL DEFAULT 'L2' CHECK (layer = 'L2'),  -- pinned; §197 + §210
subject_role TEXT NOT NULL CHECK (subject_role IN (...));
tenant_id UUID NOT NULL REFERENCES public.tenants(id);  -- backfilled from linkage
```

---

## Concern #2 — Code-Site Count Reconciliation

**Source of truth (2026-07-02 rg sweep, non-migration code paths):**

```
rg -l "user_subscriptions" . \
  -g '!node_modules' -g '!*.md' -g '!supabase/migrations' \
  -g '!types.ts' -g '!dist'
```

Returns exactly **14 runtime files**:

| # | File |
|---:|---|
| 1 | `src/components/dashboard/ClientFileView.tsx` |
| 2 | `src/components/dashboard/UpgradeBanner.tsx` |
| 3 | `src/components/dashboard/UpgradeModal.tsx` |
| 4 | `src/components/dashboard/UserPerformance.tsx` |
| 5 | `src/contexts/SubscriptionContext.tsx` |
| 6 | `src/pages/Admin.tsx` |
| 7 | `src/pages/admin/AnalyticsDashboard.tsx` |
| 8 | `supabase/functions/admin-delete-user/index.ts` |
| 9 | `supabase/functions/check-subscription/index.ts` |
| 10 | `supabase/functions/export-clients-csv/index.ts` |
| 11 | `supabase/functions/paige-ai-chat/index.ts` |
| 12 | `supabase/functions/paige-voice-chat/index.ts` |
| 13 | `supabase/functions/ship-26-legacy-cleanup/index.ts` |
| 14 | `supabase/functions/stripe-webhook/index.ts` |

**B.0 Section 0.3's numbered table appeared to show 15 because row #3 was the signup-trigger migration (`supabase/migrations/20251010023044_…sql`), included for write-intent completeness but excluded from the runtime rg sweep. That row is a schema artifact, not a runtime code site.** So: `14 runtime + 1 migration listed for intent context = 15 rows in the table; 14 unique files touched by code sweep`.

**C9's 17 reconciled.** The historical C9 finding counted **17 total files referencing `user_subscriptions` across the entire tree**, including migration files. Full migration list (9 total; rg over `supabase/migrations`):

```
20251010023044_…  -- signup trigger (INSERT on new user)  ← the one Section 0.3 lists
20251015000559_…  -- prior schema tweak
20251019220552_…
20251020005117_…
20251020005232_…
20251020010031_…
20260420192643_…
20260422162007_…
20260702012045_…  -- most recent (A.2 wave)
```

**Delta 17 → 14:** the three files that appear in C9 but not in the runtime sweep are historical migrations `20251015000559_…`, `20251019220552_…`, and `20251020005117_…` (grouped by C9 as "SQL touches" and de-duplicated in B.0 because migrations are immutable history, not code to be swept). If C9's original list is required verbatim I can attach it, but no runtime cutover is needed on those three.

**Verified count going into Migration B:**

- Runtime code sites to cutover: **14**
- Migration files (history only, no action): 9
- Ambiguous: **0**

§208 discipline satisfied: the enumeration and the count now reconcile.

---

## Path & Rename Target — Final

Path B stands as approved. Applied against the §210-corrected classification:

- Rename `public.user_subscriptions` → **`public.tenant_customer_trials`**
- Add `layer` (pinned `'L2'`), `subject_role` (CHECK per §210), `tenant_id` (NOT NULL, backfilled)
- Redirect L4-intent writes (`stripe-webhook`, `check-subscription`) → `public.consumer_subscriptions`
- Repoint remaining 12 runtime files (all L2 reads + `admin-delete-user` cleanup + `ship-26-legacy-cleanup` tooling + signup trigger) → `public.tenant_customer_trials`
- Register renamed table in `table_layer_registry` at Migration C (§207 — pending)
- Ship §198 Addendum Part 2 + **§210 canonical doctrine** in same PR (both present)

**No row copy** — 0 rows carry L4 intent.

---

## §120 Cross-Reference — `profiles` Column Drift

Sidebar acknowledgement: `ClientFileView.tsx` + `useClientChatContext.ts` were bitten by drift between assumed column names (`street_address`, `city`, `state`, `zip_code`, `phone_number`, `email`) and the actual `profiles` schema (`address`, `postal_code`, `phone`; no `city`/`state`/`email` column). Logged as a §120 column-drift case study candidate; profiles-table doctrine note to be added when §120 catalog is next revised. Canonical mapping to apply project-wide:

| Callsite assumption | Actual `profiles` column |
|---|---|
| `street_address` | `address` |
| `zip_code` | `postal_code` |
| `phone_number` | `phone` |
| `email` | *(not on `profiles`; use `auth.users.email`)* |
| `city`, `state` | *(not on `profiles`; live on `public.clients`)* |

---

**Ready for Gate:** with L2 accepted, count reconciled, rename target locked, and §210 shipped, I can proceed to draft Sections 3–9 of the full Migration B shape proposal on your go.
