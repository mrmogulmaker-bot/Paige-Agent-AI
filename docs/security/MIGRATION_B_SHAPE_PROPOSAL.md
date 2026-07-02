# Migration B — Shape Proposal (§208-Compliant)

**Sprint:** P.0.1 Gate 2
**Doctrines invoked:** §198 (Legacy Deprecation), §198 addendum (Deprecation Requires Cutover — new), §205 (Metering Safety Net), §206 (Layer Discriminator), §208 (Shape Delta Discipline)
**Status:** Sections 1–2 delivered. **Sections 3–9 BLOCKED pending resolution of the Section 2 open question.**

---

## SECTION 1 — Verified Current State (§208 mandatory)

### 1.1 `\d public.user_subscriptions` (live DB, captured this session)

```
                              Table "public.user_subscriptions"
         Column         |           Type           | Nullable |      Default
------------------------+--------------------------+----------+-------------------
 id                     | uuid                     | not null | gen_random_uuid()
 user_id                | uuid                     | not null |
 plan_slug              | text                     | not null |
 status                 | text                     | not null | 'trial'::text
 trial_ends_at          | timestamp with time zone |          |
 current_period_start   | timestamp with time zone |          |
 current_period_end     | timestamp with time zone |          |
 stripe_subscription_id | text                     |          |
 created_at             | timestamp with time zone |          | now()
 updated_at             | timestamp with time zone |          | now()
Indexes:
    "user_subscriptions_pkey" PRIMARY KEY, btree (id)
Policies (RLS ENABLED):
    "Users can insert own subscription" FOR INSERT   WITH CHECK (auth.uid() = user_id)
    "Users can update own subscription" FOR UPDATE   USING (auth.uid() = user_id)
    "Users can view own subscription"   FOR SELECT   USING (auth.uid() = user_id)
Publications: supabase_realtime
Triggers:
    trg_sync_business_limit_from_sub  AFTER INSERT|UPDATE OF plan_slug  ->  sync_user_business_limit_from_subscription()
    update_user_subscriptions_updated_at  BEFORE UPDATE  ->  update_updated_at_column()
```

### 1.2 `\d public.consumer_subscriptions` (live DB, captured this session)

```
                            Table "public.consumer_subscriptions"
         Column         |           Type           | Nullable |      Default
------------------------+--------------------------+----------+-------------------
 id                     | uuid                     | not null | gen_random_uuid()
 user_id                | uuid                     | not null |
 plan_id                | uuid                     | not null |
 status                 | text                     | not null | 'active'::text
 current_period_start   | timestamp with time zone |          |
 current_period_end     | timestamp with time zone |          |
 stripe_subscription_id | text                     |          |
 stripe_customer_id     | text                     |          |
 cancel_at_period_end   | boolean                  | not null | false
 metadata               | jsonb                    | not null | '{}'::jsonb
 created_at             | timestamp with time zone | not null | now()
 updated_at             | timestamp with time zone | not null | now()
Indexes:
    "consumer_subscriptions_pkey" PRIMARY KEY, btree (id)
    "consumer_subscriptions_user_id_idx" btree (user_id)
FK OUT:
    plan_id -> consumer_subscription_plans(id)
FK IN:
    consumer_invoices.subscription_id (ON DELETE SET NULL)
    platform_metered_events.consumer_subscription_id (ON DELETE RESTRICT)
Policies (RLS ENABLED):
    "consumer reads own sub"              FOR SELECT  USING (user_id = auth.uid() OR is_platform_owner(auth.uid()))
    "platform owner writes consumer subs" ALL         USING (is_platform_owner(auth.uid()))  WITH CHECK (is_platform_owner(auth.uid()))
Triggers:
    trg_cs_updated  BEFORE UPDATE  ->  update_updated_at_column()
```

### 1.3 Row counts
- `user_subscriptions`: **19 rows**
- `consumer_subscriptions`: **0 rows**

### 1.4 RLS status
- Both tables: `rowsecurity = true`.

### 1.5 All FKs in/out of both tables
| direction | table | column | references |
|---|---|---|---|
| OUT | consumer_subscriptions | plan_id | consumer_subscription_plans(id) |
| IN  | consumer_invoices | subscription_id | consumer_subscriptions(id) ON DELETE SET NULL |
| IN  | platform_metered_events | consumer_subscription_id | consumer_subscriptions(id) ON DELETE RESTRICT |
| OUT | user_subscriptions | — | (no FKs — `user_id` references `auth.users` only implicitly via RLS) |
| IN  | user_subscriptions | — | (no inbound FKs) |

### 1.6 Triggers on either table
Listed inline in 1.1 and 1.2.

### 1.7 Support-table verification
- `public.ecosystem_migration_log` — **DOES NOT EXIST.** Migration B must create it (see Section 5 draft).
- `public.table_layer_registry` — **DOES NOT EXIST.** Slated for Migration C (§207). Not a Migration B blocker.

### 1.8 Legacy data profile
- All 19 rows have `plan_slug = 'free'`.
- All 19 rows have `status = 'trial'`.
- All 19 rows have `stripe_subscription_id = NULL`.
- 0 duplicate `stripe_subscription_id` values (there are none to duplicate).

### 1.9 `consumer_subscription_plans` available slugs
- `founder`, `growth`, `scale` (all `is_active = true`).
- No `free` plan. No plan with matching slug.

---

## SECTION 2 — Structural Alignment Analysis

### 🚨 SECTION 2 OPEN QUESTION — BLOCKS SECTIONS 3–9

The verified data profile in §1.8/1.9 says the 19 `user_subscriptions` rows are **NOT Layer 4 consumer-direct subscriptions**. They are trial-tracker records for authenticated users of the tenant platform (all `plan_slug='free'`, `status='trial'`, no Stripe subscription). The canonical Layer 4 destination (`consumer_subscriptions`) has three real plans (`founder $27` / `growth $67` / `scale $297`) — none of which match `'free'`.

**This means Refinement 2's copy pattern (INSERT ... FROM user_subscriptions ON CONFLICT (stripe_subscription_id)) is the wrong operation for this dataset.** ON CONFLICT would insert all 19 rows with NULL stripe_subscription_id and no matching plan_id, which either:
- Fails on the NOT NULL `plan_id` (can't fabricate a plan_id when no `free` plan exists), OR
- Requires us to synthesize a `free` plan in `consumer_subscription_plans` purely to satisfy the copy, which pollutes the L4 catalog with a plan that doesn't map to any Stripe price and misrepresents the audit C9 finding.

The C9 finding was about **17 code sites writing to `user_subscriptions`** — that's a code-cutover problem, not a data-copy problem. The 19 existing rows may not be Layer 4 data at all. They may be:
- **(A)** L3 tenant-platform trial state that should stay in `user_subscriptions` (or move to a tenant-scoped table) and never enter Layer 4.
- **(B)** Test/seed data safe to archive-and-drop rather than migrate.
- **(C)** Genuine future-L4 users we owe a real Founder-tier subscription to on first paid conversion.

### Three possible paths forward (need your call):

**Path 1 — Split by intent (recommended).**
Declare the 19 rows L3 tenant-platform trial state. **Do not copy** them to `consumer_subscriptions`. Migration B becomes purely a **code cutover + schema deprecation** exercise: mark `user_subscriptions.deprecated_at`, install DISABLED write-freeze, add §198 addendum + `ecosystem_migration_log`, arm freeze at Gate 6 after C9's 17 code sites are repointed to their correct destinations (either `consumer_subscriptions` for new signups OR a new tenant-trial table for existing behavior — depends on what each of the 17 sites actually needs).
Data copy: **0 rows** (audit-log an empty copy with reason).

**Path 2 — Archive-and-drop.**
Same as Path 1, but explicitly move the 19 rows to `user_subscriptions_archive_2026_07` and truncate. Cleaner state, no dangling deprecated table with data.

**Path 3 — Synthesize a `free` plan and copy anyway.**
Insert a `free` row into `consumer_subscription_plans` (0-cent, no Stripe price), then copy the 19 rows mapping `plan_slug='free' -> plan_id=<new free id>`. Preserves original scope but pollutes L4 catalog and creates a plan that violates the Founder/Growth/Scale tier matrix.

**My recommendation:** Path 1. It matches the C9 finding's actual shape (code cutover, not data migration) and doesn't corrupt the L4 catalog. Path 2 is defensible if you want a cleaner deprecated table. Path 3 I'd argue against.

**Sections 3–9 shape depends entirely on this call**, because Section 3 (copy pattern) is either non-trivial (Path 3), archival-only (Path 2), or a no-op with audit entry (Path 1); Section 4 (verification) checks differ per path; Section 5's audit log entry differs per path.

---

### 2.1 Column-by-column alignment (informational — assumes hypothetical Path 3 copy)

| column | user_subscriptions | consumer_subscriptions | status | notes |
|---|---|---|---|---|
| id | uuid PK | uuid PK | identical | preserve on copy |
| user_id | uuid NOT NULL | uuid NOT NULL | identical | direct copy |
| plan_slug | text NOT NULL | — | **missing_in_target** | consumer_subscriptions uses `plan_id` FK, not slug. Requires **transform**: `plan_id = (SELECT id FROM consumer_subscription_plans WHERE slug = us.plan_slug)`. **Fails for `'free'`** — no matching plan exists (see blocker above). |
| — | — | plan_id uuid NOT NULL | missing_in_target | see above |
| status | text NOT NULL default 'trial' | text NOT NULL default 'active' | **needs_transform** | user_subs uses `'trial'`; consumer_subs vocabulary needs mapping. Propose: `'trial' -> 'trialing'` (Stripe canonical) — but consumer_subscriptions has no status CHECK, so any string lands. Recommend adding a CHECK constraint as part of Migration A.3 if we proceed. |
| trial_ends_at | timestamptz nullable | — | **missing_in_target** | Two options: (a) add `trial_ends_at` to consumer_subscriptions via Migration A.3, or (b) stash into `metadata->>'trial_ends_at'`. Recommend (a) — it's a first-class concept for Founder tier trials. |
| current_period_start | timestamptz nullable | timestamptz nullable | identical | direct copy |
| current_period_end | timestamptz nullable | timestamptz nullable | identical | direct copy |
| stripe_subscription_id | text nullable | text nullable | identical | direct copy (all NULL in source) |
| — | — | stripe_customer_id text nullable | extra_in_target | leave NULL on copy |
| — | — | cancel_at_period_end bool NOT NULL default false | extra_in_target | accept default |
| — | — | metadata jsonb NOT NULL default '{}' | extra_in_target | populate with `jsonb_build_object('migrated_from','user_subscriptions','legacy_plan_slug', us.plan_slug)` for provenance |
| created_at | timestamptz nullable | timestamptz NOT NULL | **needs_transform** | preserve via `COALESCE(us.created_at, now())` |
| updated_at | timestamptz nullable | timestamptz NOT NULL | **needs_transform** | preserve via `COALESCE(us.updated_at, now())` |

### 2.2 Primary key strategy
Both use `uuid PK` with `gen_random_uuid()` default. **Preserve source `id`** on copy to keep any downstream references (there are none today, but future audits benefit from stable IDs).

### 2.3 NOT NULL constraints on target that source might not satisfy
- `consumer_subscriptions.plan_id NOT NULL` — **cannot be satisfied** by current source rows (see blocker).
- `consumer_subscriptions.created_at NOT NULL` — satisfied via COALESCE.
- `consumer_subscriptions.updated_at NOT NULL` — satisfied via COALESCE.
- `consumer_subscriptions.cancel_at_period_end NOT NULL` — default accepts.
- `consumer_subscriptions.metadata NOT NULL` — default accepts.

### 2.4 Prerequisite migrations surfaced by §208 alignment
If you choose Path 3 (copy):
- **Migration A.3 (schema prep on consumer_subscriptions):**
  - `ADD COLUMN trial_ends_at TIMESTAMPTZ` (nullable)
  - `ADD CONSTRAINT consumer_subscriptions_status_check CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired'))`
  - Backfill `status='trialing'` for any pre-existing rows (0 today)
- **Prerequisite data step:** decide `'free'` plan handling before A.3.

If you choose Path 1 or 2:
- **No Migration A.3 needed.** Migration B's schema surface shrinks to `deprecated_at` on `user_subscriptions` + `ecosystem_migration_log` create + write-freeze trigger DISABLED + §198 addendum doctrine file.

---

## Sections 3–9 — DEFERRED

Awaiting your call between Path 1 / Path 2 / Path 3.

**When you decide:**
- **Path 1** — I'll deliver Sections 3–9 in the same document with copy pattern as a no-op audit entry + code-cutover callout for Gate 3.
- **Path 2** — Sections 3–9 with `user_subscriptions_archive_2026_07` table create + archive INSERT + TRUNCATE.
- **Path 3** — First propose Migration A.3 as its own §208-compliant document, then return here to complete Sections 3–9 with the full copy pattern.

---

## Reviewer checklist so far

- [x] §208 verified current state (both tables)
- [x] Row counts + RLS + FKs + triggers documented
- [x] Structural alignment table complete
- [x] Blocker flagged at top of Section 2 rather than silently defaulted
- [x] Support tables (`ecosystem_migration_log`, `table_layer_registry`) presence verified
- [ ] Path decision (1 / 2 / 3) — **awaiting user**
- [ ] Sections 3–9 — blocked on path decision

